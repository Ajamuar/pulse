// Stage 1: per-sample work for the days whose inputs changed. Reads hr_samples and steps_minutes and
// caches each day's strain, activities, session resting HR and per-minute series.
import type { Db } from "../db";
import { addDays } from "../time";
import { hrRecovery } from "@/core/scoring/hrRecovery";
import { sessionRestingHR } from "@/core/scoring/restingHr";
import { defaultRestingHR, strain } from "@/core/scoring/strain";
import type { BaselineState, HrSample } from "@/core/scoring/types";
import { timeInZone, zones as hrZones } from "@/core/scoring/zones";
import { minuteLoad } from "@/core/algorithms/energyBank";
import { minuteMeanHr, stress } from "@/core/algorithms/stress";
import { BATCH_DAYS, type Data, type Exercise, r1, round, SERIES_UPSERT, type Session, sha, touching } from "./data";
import { type PipelineOptions, SCORING_VERSION, type Stage1Activity, type Stage1Day } from "./types";

/** A baseline whose centre is set, so stress() scores every still minute; only the still mask is kept. */
const MASK_BASELINE: BaselineState = { baseline: 0, spread: 1, nValid: 1, nightsSinceUpdate: 0, status: "calibrating" };

function stage1Key(data: Data, day: string, opts: PipelineOptions) {
  const lo = data.dayStart(day);
  const hi = data.dayStart(addDays(day, 1));
  const main = data.mainOf.get(day);
  return sha(
    JSON.stringify([
      SCORING_VERSION,
      opts.timeZone, // the day's bounds come from it
      opts.profile.maxHr,
      data.metrics.get(day)?.rhrBpm ?? null,
      main ? [main.id, main.startTs, main.endTs] : null,
      touching(data.sessions, lo, hi).map((s) => [s.id, s.startTs, s.endTs, s.isMain]),
      touching(data.exercises, lo, hi + 330).map((e) => [e.id, e.startTs, e.endTs, e.type, e.day]),
    ]),
  );
}

export function stage1(db: Db, data: Data, opts: PipelineOptions): string[] {
  const c = db.$client;
  // A row written under another scoring version is stale whatever its key says.
  const stored = new Map(
    (c.prepare("select day, scoring_version v, strain from daily_scores").all() as { day: string; v: number; strain: string | null }[]).map((r) => [
      r.day,
      r.strain && r.v === SCORING_VERSION ? (JSON.parse(r.strain) as Stage1Day).key : null,
    ]),
  );
  const dirty = new Set(c.prepare("select day from intraday_dirty").pluck().all() as string[]);
  // A night that starts before midnight reads the previous day's HR for its resting HR.
  for (const d of [...dirty]) {
    const main = data.mainOf.get(addDays(d, 1));
    if (main && main.startTs < data.dayStart(addDays(d, 1))) dirty.add(addDays(d, 1));
  }
  const keys = new Map(data.days.map((d) => [d, stage1Key(data, d, opts)]));
  const todo = data.days.filter((d) => dirty.has(d) || stored.get(d) !== keys.get(d));

  const readHr = c.prepare("select ts, bpm from hr_samples where ts >= ? and ts < ? order by ts");
  const readSteps = c.prepare("select ts, steps from steps_minutes where ts >= ? and ts < ?");
  // Stage 1 never stamps scoring_version (a new row gets 0) and leaves intraday_dirty alone: stage 2 does
  // both when it commits, so a crash between the stages still shows up in needsRecompute.
  const upsert = c.prepare(
    `insert into daily_scores (day, scoring_version, strain, activities, session_rhr_bpm) values (?, 0, ?, ?, ?)
     on conflict(day) do update set strain = excluded.strain,
       activities = excluded.activities, session_rhr_bpm = excluded.session_rhr_bpm`,
  );
  const series = c.prepare(SERIES_UPSERT);

  // Written in batches as it goes: holding every day's three per-minute series until one final write made
  // memory grow with history (3 years of a full recompute overflowed a 96 MB heap). Each day's key is its own,
  // so a crash between batches just recomputes the days not yet written.
  const write = c.transaction((batch: string[]) => {
    for (const day of batch) {
      const start = data.dayStart(day);
      const end = data.dayStart(addDays(day, 1));
      const main = data.mainOf.get(day);
      const exs = data.exercisesByDay.get(day) ?? [];
      const lo = Math.min(start, main?.startTs ?? start);
      const hi = Math.max(end, ...exs.map((e) => e.endTs + 330));
      const hr = readHr.all(lo, hi) as HrSample[];
      const steps = readSteps.all(start, end) as { ts: number; steps: number }[];
      const r = stage1Day(data, day, start, end, main, exs, hr, steps, keys.get(day)!, opts);
      upsert.run(day, JSON.stringify(r.s1), JSON.stringify(r.activities), r.sessionRhr);
      series.run(day, "hr", JSON.stringify(r.hrSeries));
      series.run(day, "still_hr", JSON.stringify(r.still));
      series.run(day, "load", JSON.stringify(r.load));
    }
  });
  for (let i = 0; i < todo.length; i += BATCH_DAYS) write(todo.slice(i, i + BATCH_DAYS));
  return todo;
}

function stage1Day(
  data: Data,
  day: string,
  start: number,
  end: number,
  main: Session | undefined,
  exs: Exercise[],
  hr: HrSample[],
  stepRows: { ts: number; steps: number }[],
  key: string,
  opts: PipelineOptions,
) {
  const maxHr = opts.profile.maxHr;
  const dayHr = hr.filter((s) => s.ts >= start && s.ts < end);
  const sessionRhr = main ? sessionRestingHR(main.startTs, main.endTs, hr) : null;
  const dailyRhr = data.metrics.get(day)?.rhrBpm ?? null;
  const restingHr = sessionRhr ?? dailyRhr ?? defaultRestingHR;
  const zoneSet = hrZones(maxHr, "manual");
  const tiz = (xs: HrSample[]) => timeInZone(xs, zoneSet).seconds;

  const means = minuteMeanHr(dayHr, start, end);
  const n = means.length;
  const steps = new Array<number>(n).fill(0);
  for (const s of stepRows) steps[Math.floor((s.ts - start) / 60)] = s.steps;
  const excluded = [...touching(data.sessions, start, end), ...touching(data.exercises, start, end)].map((x) => ({
    start: x.startTs,
    end: x.endTs,
  }));
  const probe = stress({ start, end, hr: dayHr, steps, excluded, baseline: MASK_BASELINE });
  const still = probe.minutes.map((v, m) => (v == null ? null : means[m]));
  const noon = Math.min(n, 720);
  const withHr = (from: number, to: number) => means.slice(from, to).filter((v) => v != null).length;

  const s1: Stage1Day = {
    key,
    hrCount: dayHr.length,
    hrMinutesAm: withHr(0, noon),
    hrMinutesPm: withHr(noon, n),
    lastHrTs: dayHr.at(-1)?.ts ?? null,
    restingHr,
    restingHrSource: sessionRhr != null ? "session" : dailyRhr != null ? "daily" : "default",
    maxHr,
    effort: strain(dayHr, maxHr, restingHr),
    zoneLower: zoneSet.zones.map((z) => round(z.lower, 1)),
    zoneSeconds: tiz(dayHr),
    dayAggregate: probe.dayAggregate,
    stillMinutes: still.filter((v) => v != null).length,
  };
  const activities: Stage1Activity[] = exs.map((e) => {
    const xs = hr.filter((s) => s.ts >= e.startTs && s.ts <= e.endTs);
    return {
      id: e.id,
      effort: strain(xs, maxHr, restingHr),
      hrCount: xs.length,
      avgHr: xs.length ? round(xs.reduce((a, s) => a + s.bpm, 0) / xs.length, 1) : null,
      maxHr: xs.length ? Math.max(...xs.map((s) => s.bpm)) : null,
      zoneSeconds: tiz(xs),
      hrr: hrRecovery(hr, e.startTs, e.endTs, maxHr),
    };
  });
  return {
    s1,
    activities,
    sessionRhr,
    hrSeries: means.map(r1),
    still,
    load: minuteLoad(means, restingHr, maxHr),
  };
}
