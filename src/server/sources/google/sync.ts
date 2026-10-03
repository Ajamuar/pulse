// Google source (U4): per type, a 180-day first backfill walked oldest first with "N of 180 days"
// progress in sync_state, then a trailing re-fetch every run. Writes are upserts that only touch a
// row whose values differ, so an unchanged re-fetch is a no-op, `changed` is honest, and only days
// whose intraday inputs actually changed land in intraday_dirty.
//
// Deletions: `list` returns a window whole or throws, so within a list window we hold exactly what
// Google returns. A sleep session, exercise or band HR sample there that Google left out was deleted
// in Fitbit; it is removed and its day marked dirty. Rows outside the window are never touched.
// This assumes Google omits deleted points; a tombstone shape would need a filter in map.ts.
//
// Each type runs on its own: a failure records the GoogleError's safe message (status and code,
// never a body or token) in its sync_state row and the next type carries on. A chunk's rows and its
// cursor commit in one transaction, so an interrupted backfill resumes where it stopped.
import type { Statement } from "better-sqlite3";
import { eq, getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getConfig } from "../../config";
import { type Db, getDb } from "../../db";
import { dailyMetrics, exercises, healthRecords, oauthTokens, sleepSessions, syncState } from "../../db/schema";
import type { Source } from "../types";
import { DATA_TYPES, type DataTypeId } from "./catalogue";
import { addDays, localDay, localMidnight } from "../../time";
import { type ClientDeps, createGoogleClient, localWindows, pruneRawPayloads, type TimeWindow } from "./client";
import {
  DAILY_TYPES,
  type DailyRow,
  EXTRA_TYPES,
  type ExtraType,
  mapDaily,
  mapExercises,
  mapExtra,
  mapHeartRate,
  mapHeight,
  mapRecords,
  mapRollup,
  mapSleep,
  mapStepsMinutes,
  type RollupType,
  type SegmentRow,
} from "./map";
import { GoogleError } from "./oauth";

export const BACKFILL_DAYS = 180;
/** The sync_state row for the paired-device check; its lastError holds NO_PAIRED_DEVICE while the account has none. */
export const DEVICES_KEY = "paired-devices";
export const NO_DEVICE_ERROR = `[google] ${DEVICES_KEY}: NO_PAIRED_DEVICE`;
/** daily-*, sleep, exercise, sample types and rollups re-fetch this many local days before synced_through. */
const OVERLAP_DAYS = 3;
/** heart-rate and steps re-fetch from synced_through minus this. */
const INTRADAY_OVERLAP_S = 3600;

type Job =
  | { key: string; kind: "daily"; type: (typeof DAILY_TYPES)[number] }
  | { key: string; kind: "rollup"; type: RollupType }
  | { key: string; kind: "extra"; type: ExtraType }
  | { key: string; kind: "records"; type: "electrocardiogram" | "irregular-rhythm-notification" }
  | { key: string; kind: "sleep" | "exercise" | "hr" | "steps" | "height"; type: DataTypeId };

/** Shown-only extras (src/lib/extraMetrics.ts). heart-rate's roll-up gets its own key: "heart-rate" is the sample list. */
export const EXTRA_JOBS: Job[] = [
  ...EXTRA_TYPES.map((type) => ({ key: type === "heart-rate" ? "heart-rate-daily" : type, kind: "extra" as const, type })),
  { key: "electrocardiogram", kind: "records", type: "electrocardiogram" },
  { key: "irregular-rhythm-notification", kind: "records", type: "irregular-rhythm-notification" },
  { key: "height", kind: "height", type: "height" },
];
export const EXTRA_JOB_KEYS = new Set(EXTRA_JOBS.map((j) => j.key));

/** Cheap types first, so a first connect shows daily data long before heart rate (~1,300 requests) is done. */
const JOBS: Job[] = [
  ...DAILY_TYPES.map((type) => ({ key: type, kind: "daily" as const, type })),
  { key: "sleep", kind: "sleep", type: "sleep" },
  { key: "exercise", kind: "exercise", type: "exercise" },
  { key: "total-calories", kind: "rollup", type: "total-calories" },
  { key: "steps-daily", kind: "rollup", type: "steps" }, // daily totals; "steps" below is per minute
  { key: "steps", kind: "steps", type: "steps" },
  // Score inputs from roll-ups (Pulse Age's zone minutes, Health Monitor's ranges); "rollup" sets `changed`.
  { key: "time-in-heart-rate-zone", kind: "rollup", type: "time-in-heart-rate-zone" },
  // Personal ranges (rhr/hrv) are not fetched: the API answers UNSUPPORTED_DATA_TYPE_ACTION to a roll-up on the
  // daily types (checked on a real account, 2026-10-03), so Health Monitor keeps Pulse's own ranges.
  { key: "heart-rate", kind: "hr", type: "heart-rate" },
  // Last, so the scored data lands first; each fails on its own (a scope granted later, a 400 on a new type).
  ...EXTRA_JOBS,
];

export type SyncDeps = ClientDeps & { log?: Pick<Console, "error"> };

export function createGoogleSource(deps: SyncDeps): Source {
  const { db, timeZone: tz, now = Date.now, log = console } = deps;
  const nowS = () => Math.floor(now() / 1000);

  const setState = (key: string, patch: Partial<typeof syncState.$inferInsert>) =>
    db.insert(syncState).values({ type: key, ...patch }).onConflictDoUpdate({ target: syncState.type, set: patch }).run();

  return {
    async pull() {
      if (!db.select().from(oauthTokens).get()) return { changed: false }; // not connected yet
      const client = createGoogleClient(deps); // one per run: it holds the rate limiter
      const w = writer(db, tz);
      const run = { changed: false };

      // A Google Health profile with no paired device imports 180 empty days; say so instead (Settings,
      // ConnectionBanner). Only a clear "none" sets it and a clear "some" clears it; an error or an unknown
      // shape keeps the last answer, so a bad day at Google never claims the band is missing.
      try {
        const devices = await client.pairedDevices();
        if (devices !== "unknown") {
          setState(DEVICES_KEY, { lastAttemptAt: nowS(), lastSuccessAt: nowS(), lastError: devices === "none" ? NO_DEVICE_ERROR : null });
        }
      } catch (err) {
        log.error(err instanceof GoogleError ? err.message : "[sync] pairedDevices: internal error");
      }

      for (const job of JOBS) {
        setState(job.key, { lastAttemptAt: nowS() });
        try {
          await syncJob(job);
          setState(job.key, { lastSuccessAt: nowS(), lastError: null });
        } catch (err) {
          const safe = err instanceof GoogleError ? err.message : `[sync] ${job.key}: internal error`;
          setState(job.key, { lastError: safe });
          log.error(err instanceof GoogleError ? safe : `[sync] ${job.key} failed: ${(err as Error)?.stack ?? err}`);
        }
      }
      pruneRawPayloads(db, nowS()); // every run, so the archive stays bounded (client.ts)
      return { changed: run.changed };

      async function syncJob(job: Job) {
        const st = db.select().from(syncState).where(eq(syncState.type, job.key)).get();
        const t = nowS();
        const today = localDay(t, tz);
        const fresh = st?.syncedThrough == null;
        const backfilling = fresh || (st.backfillDaysDone ?? 0) < (st.backfillDaysTotal ?? BACKFILL_DAYS);
        let done = fresh ? 0 : (st.backfillDaysDone ?? 0);

        let from: number;
        if (fresh) {
          from = localMidnight(addDays(today, 1 - BACKFILL_DAYS), tz); // today is day 180
          setState(job.key, { backfillDaysDone: 0, backfillDaysTotal: BACKFILL_DAYS });
        } else if (backfilling) {
          from = st.syncedThrough!; // the last committed chunk's end
        } else {
          const through = st.syncedThrough!;
          from = localMidnight(addDays(localDay(through, tz), -OVERLAP_DAYS), tz);
          if (job.kind === "hr" || job.kind === "steps") {
            // From the last sample too, not just the cursor, so a band that uploads hours late is not
            // lost behind a 1-hour overlap.
            // ponytail: a band silent for more than OVERLAP_DAYS loses the older part; widen if seen.
            const last = w.lastSample(job.kind) ?? Infinity;
            from = Math.max(from, minute(Math.min(through, last + 1) - INTRADAY_OVERLAP_S));
          }
        }

        // heart-rate one local day at a time: list() holds the whole range in memory (~37k points/day).
        const chunkDays = job.kind === "hr" ? 1 : DATA_TYPES[job.type].maxDays;
        for (const win of localWindows(from, t, chunkDays, tz)) {
          const points =
            job.kind === "rollup" || job.kind === "extra"
              ? await client.dailyRollUp(job.type, localDay(win.start, tz), dayAfter(win.end, tz))
              : await client.list(job.type, win.start, win.end);
          db.$client.transaction(() => {
            if (w.write(job, points, win)) run.changed = true;
            if (backfilling) done = Math.min(BACKFILL_DAYS, done + daysIn(win, tz));
            setState(job.key, { syncedThrough: win.end, ...(backfilling && { backfillDaysDone: done }) });
          })();
        }
        if (backfilling) setState(job.key, { syncedThrough: t, backfillDaysDone: BACKFILL_DAYS });
      }
    },
  };
}

/** The app's source: config and database from the environment, one client per pull. */
export const googleSource: Source = {
  pull() {
    const cfg = getConfig();
    if (!cfg.google) return Promise.resolve({ changed: false });
    return createGoogleSource({ db: getDb(), google: cfg.google, timeZone: cfg.timeZone }).pull();
  },
};

const minute = (s: number) => Math.floor(s / 60) * 60;

/** The exclusive civil end day for a window ending at `end`: the day after, unless `end` is a local midnight. */
const dayAfter = (end: number, tz: string) =>
  localMidnight(localDay(end, tz), tz) === end ? localDay(end, tz) : addDays(localDay(end, tz), 1);

/** Local days a window touches. */
const daysIn = (w: TimeWindow, tz: string) =>
  Math.round((Date.parse(localDay(w.end - 1, tz)) - Date.parse(localDay(w.start, tz))) / 86_400_000) + 1;

// --- Writes ---------------------------------------------------------------------------------------

function writer(db: Db, tz: string) {
  const c = db.$client;
  const stmts = new Map<string, Statement>();
  const prep = (q: string) => stmts.get(q) ?? stmts.set(q, c.prepare(q)).get(q)!;

  // Local midnight sits on a UTC quarter hour in every zone, so one lookup per 15 minutes is exact.
  const days = new Map<number, string>();
  const dayOf = (ts: number) => {
    const q = Math.floor(ts / 900);
    return days.get(q) ?? days.set(q, localDay(q * 900, tz)).get(q)!;
  };

  /** Inserts a row, or updates it when any value differs. True when a row was written. */
  function upsert(table: SQLiteTable, key: string, row: Record<string, unknown>): boolean {
    const cols = getTableColumns(table);
    const names = Object.keys(row).map((k) => `"${cols[k].name}"`);
    const set = names.filter((n) => n !== `"${key}"`);
    const q =
      `INSERT INTO "${getTableName(table)}" (${names}) VALUES (${names.map(() => "?")}) ` +
      `ON CONFLICT ("${key}") DO UPDATE SET ${set.map((n) => `${n} = excluded.${n}`)} ` +
      `WHERE ${set.map((n) => `${n} IS NOT excluded.${n}`).join(" OR ")}`;
    const values = Object.values(row).map((v) => (typeof v === "boolean" ? Number(v) : (v ?? null)));
    return prep(q).run(values).changes > 0;
  }

  const dailyRows = (rows: DailyRow[]) =>
    rows.map((r) => upsert(dailyMetrics, "day", { ...r, source: "google" })).includes(true);

  /** Replaces a session's segments when they differ. */
  function segments(sessionId: string, next: SegmentRow[]): boolean {
    const old = prep("SELECT start_ts, end_ts, stage FROM sleep_segments WHERE session_id = ? ORDER BY start_ts").all(sessionId);
    const rows = next.map((s) => ({ start_ts: s.startTs, end_ts: s.endTs, stage: s.stage }));
    if (JSON.stringify(old) === JSON.stringify(rows)) return false;
    prep("DELETE FROM sleep_segments WHERE session_id = ?").run(sessionId);
    const ins = prep("INSERT INTO sleep_segments (session_id, start_ts, end_ts, stage) VALUES (?, ?, ?, ?)");
    for (const r of rows) ins.run(sessionId, r.start_ts, r.end_ts, r.stage);
    return true;
  }

  /** Deletes the rows of `table` with `col` in the window whose id Google did not return. Returns their days. */
  function prune(table: "sleep_sessions" | "exercises", col: "start_ts" | "end_ts", win: TimeWindow, returned: { id: string }[]) {
    const keep = new Set(returned.map((r) => r.id));
    const held = prep(`SELECT id, day FROM ${table} WHERE ${col} >= ? AND ${col} < ?`).all(win.start, win.end) as { id: string; day: string }[];
    const del = prep(`DELETE FROM ${table} WHERE id = ?`); // a session's segments cascade
    return held.filter((r) => !keep.has(r.id)).map((r) => (del.run(r.id), r.day));
  }

  /** Writes a list window's points (or a rollup's) for a job; marks changed days dirty. True when anything changed. */
  function write(job: Job, points: unknown[], win: TimeWindow): boolean {
    const dirty = new Set<string>();
    let changed = false;
    switch (job.kind) {
      case "daily":
        changed = dailyRows(mapDaily(job.type, points, tz));
        break;
      case "rollup":
        changed = dailyRows(mapRollup(job.type, points));
        break;
      // Extras and records feed no score, so they never set `changed` (no recompute for them).
      case "extra": {
        const q = prep("INSERT INTO daily_values (day, key, value) VALUES (?, ?, ?) ON CONFLICT (day, key) DO UPDATE SET value = excluded.value WHERE value IS NOT excluded.value");
        for (const v of mapExtra(job.type, points)) q.run(v.day, v.key, v.value);
        break;
      }
      case "records":
        for (const r of mapRecords(job.type, points, tz)) upsert(healthRecords, "id", { ...r, data: JSON.stringify(r.data) });
        break;
      case "height": {
        // Pulse Age's lean-mass term reads it when the profile has no height, so a new value rescores.
        const h = mapHeight(points);
        if (h) changed = prep("INSERT INTO daily_values (day, key, value) VALUES ('latest', 'height_cm', ?) ON CONFLICT (day, key) DO UPDATE SET value = excluded.value WHERE value IS NOT excluded.value").run(h.cm).changes > 0;
        break;
      }
      case "hr": {
        const q = prep("INSERT INTO hr_samples (ts, bpm) VALUES (?, ?) ON CONFLICT (ts) DO UPDATE SET bpm = excluded.bpm WHERE bpm IS NOT excluded.bpm");
        const hr = mapHeartRate(points);
        for (const [ts, bpm] of hr) if (q.run(ts, bpm).changes) dirty.add(dayOf(ts));
        // ponytail: only when the window has band HR, so an empty or unreadable answer never wipes a day;
        // a whole window deleted upstream stays. Drop the guard if that is ever seen.
        if (hr.size) {
          const del = prep("DELETE FROM hr_samples WHERE ts = ?");
          const held = prep("SELECT ts FROM hr_samples WHERE ts >= ? AND ts < ?").pluck().all(win.start, win.end) as number[];
          for (const ts of held) if (!hr.has(ts) && del.run(ts).changes) dirty.add(dayOf(ts));
        }
        break;
      }
      case "steps": {
        // Max with the stored minute too: a multi-minute interval that starts before the re-fetch
        // window must not shrink the minutes it spills into.
        const q = prep("INSERT INTO steps_minutes (ts, steps) VALUES (?, ?) ON CONFLICT (ts) DO UPDATE SET steps = excluded.steps WHERE excluded.steps > steps");
        for (const [ts, n] of mapStepsMinutes(points)) if (q.run(ts, n).changes) dirty.add(dayOf(ts));
        break;
      }
      // Sessions feed stage 1 too (session resting HR, per-activity strain), so a changed one marks its day.
      case "sleep": {
        const { sessions, segments: segs } = mapSleep(points, tz);
        for (const s of sessions) {
          const a = upsert(sleepSessions, "id", s);
          const b = segments(s.id, segs.filter((g) => g.sessionId === s.id));
          if (a || b) dirty.add(s.day);
        }
        // Only when every point was readable: a shape change must not read as "all deleted".
        if (sessions.length === points.length) for (const d of prune("sleep_sessions", "end_ts", win, sessions)) dirty.add(d);
        break;
      }
      case "exercise": {
        const rows = mapExercises(points, tz);
        for (const e of rows) if (upsert(exercises, "id", e)) dirty.add(e.day);
        // The filter is on civil start time, which is start_ts in this zone.
        if (rows.length === points.length) for (const d of prune("exercises", "start_ts", win, rows)) dirty.add(d);
        break;
      }
    }
    const mark = prep("INSERT INTO intraday_dirty (day) VALUES (?) ON CONFLICT DO NOTHING");
    for (const d of dirty) mark.run(d);
    return changed || dirty.size > 0;
  }

  /** The newest stored intraday sample, unix seconds. */
  const lastSample = (kind: "hr" | "steps") =>
    (prep(`SELECT max(ts) AS t FROM ${kind === "hr" ? "hr_samples" : "steps_minutes"}`).get() as { t: number | null }).t;

  return { write, lastSample };
}
