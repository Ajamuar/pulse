// Loading: the daily rows, sessions and exercises both stages fold over, and small shared helpers.
import { createHash } from "node:crypto";
import type { Db } from "../db";
import { addDays, daysBetween, localDay, localMidnight } from "../time";
import type { PipelineOptions } from "./types";

export type Session = {
  id: string;
  day: string;
  startTs: number;
  endTs: number;
  isMain: boolean;
  processed: boolean;
  stagesStatus: string | null;
  asleepMin: number | null;
  awakeMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
};
export type Exercise = { id: string; day: string; startTs: number; endTs: number; type: string; name: string | null; calories: number | null };
export type Metrics = {
  day: string;
  hrvMs: number | null;
  rhrBpm: number | null;
  respBpm: number | null;
  nightlyTempC: number | null;
  spo2Pct: number | null;
  vo2maxDaily: number | null;
  vo2maxRun: number | null;
  steps: number | null;
  calories: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
};
export type Segment = { sessionId: string; startTs: number; endTs: number; stage: "awake" | "light" | "deep" | "rem" };

export type Data = ReturnType<typeof load> & {};

export function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function load(db: Db, { timeZone: tz }: PipelineOptions) {
  const c = db.$client;
  const all = <T>(q: string) => c.prepare(q).all() as T[];
  const metrics = all<Metrics>(
    `select day, hrv_ms hrvMs, rhr_bpm rhrBpm, resp_bpm respBpm, nightly_temp_c nightlyTempC, spo2_pct spo2Pct,
       vo2max_daily vo2maxDaily, vo2max_run vo2maxRun, steps, calories, weight_kg weightKg, body_fat_pct bodyFatPct
     from daily_metrics order by day`,
  );
  const sessions = all<Session>(
    `select id, day, start_ts startTs, end_ts endTs, is_main isMain, processed, stages_status stagesStatus,
       asleep_min asleepMin, awake_min awakeMin, deep_min deepMin, light_min lightMin, rem_min remMin
     from sleep_sessions order by start_ts, id`,
  ).map((s) => ({ ...s, isMain: !!s.isMain, processed: !!s.processed }));
  const exercises = all<Exercise>(
    "select id, day, start_ts startTs, end_ts endTs, type, name, calories from exercises order by start_ts, id",
  );
  const hrSpan = c.prepare("select min(ts) lo, max(ts) hi from hr_samples").get() as { lo: number | null; hi: number | null };

  const candidates = [
    ...metrics.map((m) => m.day),
    ...sessions.map((s) => s.day),
    ...exercises.map((e) => e.day),
    ...(hrSpan.lo != null ? [localDay(hrSpan.lo, tz), localDay(hrSpan.hi!, tz)] : []),
  ].sort();
  if (!candidates.length) return null;
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const days = Array.from({ length: daysBetween(first, last) + 1 }, (_, i) => addDays(first, i));
  const start = new Map(days.map((d) => [d, localMidnight(d, tz)]));
  start.set(addDays(last, 1), localMidnight(addDays(last, 1), tz));

  const sessionsByDay = groupBy(sessions, (s) => s.day);
  const mainOf = new Map<string, Session>();
  for (const [day, list] of sessionsByDay) {
    const mains = list.filter((s) => s.isMain).sort((a, b) => b.endTs - b.startTs - (a.endTs - a.startTs) || a.id.localeCompare(b.id));
    if (mains.length) mainOf.set(day, mains[0]);
  }
  return {
    days,
    first,
    last,
    dayStart: (d: string) => start.get(d) ?? localMidnight(d, tz),
    metrics: new Map(metrics.map((m) => [m.day, m])),
    sessions,
    sessionsByDay,
    mainOf,
    exercises,
    exercisesByDay: groupBy(exercises, (e) => e.day),
  };
}

/** Sessions and exercises that overlap [lo, hi). */
export const touching = <T extends { startTs: number; endTs: number }>(xs: T[], lo: number, hi: number) =>
  xs.filter((x) => x.endTs > lo && x.startTs < hi);

export const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
export const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
export const r1 = (x: number | null) => (x == null ? null : round(x, 1));

/** Days per write transaction: keeps memory flat in history length and each write lock short. */
export const BATCH_DAYS = 30;

/** Upserts a per-minute series, writing only when it differs. */
export const SERIES_UPSERT = `insert into intraday_series (day, kind, data) values (?, ?, ?)
     on conflict(day, kind) do update set data = excluded.data where data is not excluded.data`;
