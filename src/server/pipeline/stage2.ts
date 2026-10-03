// Stage 2: folds every day, oldest first, over the daily rows and stage 1's cached results, then
// writes only the rows, series and reports whose JSON changed.
import type { Db } from "../db";
import { addDays } from "../time";
import { hrvCfg, respCfg, restingHRCfg, skinTempCfg, update } from "@/core/scoring/baselines";
import { journalImpact, type JournalDay, type TagImpact } from "@/core/algorithms/journalImpact";
import { buildReport, periodBounds, reportPeriods } from "@/core/algorithms/reports";
import { type Data, groupBy, type Segment, SERIES_UPSERT, sha } from "./data";
import {
  type Cached,
  dayOf,
  forecastOf,
  type Inputs,
  newFold,
  recordOutcomes,
  scoreEnergyBank,
  scoreFitness,
  scoreHealthMonitor,
  scoreHealthspan,
  scorePlanner,
  scoreRecovery,
  scoreSleep,
  scoreStrainTarget,
  scoreStress,
  scoreTrainingLoad,
} from "./scores";
import { type JournalImpactRow, type PipelineOptions, SCORING_VERSION, STAGE2_COLUMNS, type Stage2Row } from "./types";

export function stage2(db: Db, data: Data, opts: PipelineOptions) {
  const c = db.$client;
  const tz = opts.timeZone;
  const { days } = data;
  const { inputs, journal } = readInputs(db);

  const f = newFold();
  const out = new Map<string, Omit<Stage2Row, "journal_impact">>();
  const stressSeries = new Map<string, (number | null)[]>();
  const energySeries = new Map<string, (number | null)[]>();

  // Order matters: each scorer reads the fold as earlier scorers left it for today.
  for (const day of days) {
    const d = dayOf(data, inputs, day, opts);
    const sleep = scoreSleep(data, inputs, f, d, tz);
    const recovery = scoreRecovery(f, d, sleep);
    const trainingLoad = scoreTrainingLoad(f, d, recovery);
    const strainTarget = scoreStrainTarget(f, recovery);
    const planner = scorePlanner(f, d, sleep, tz);
    recovery.forecast = forecastOf(f, d, recovery, planner.plan, planner.tonightNeed);
    const stress = scoreStress(f, d, inputs);
    stressSeries.set(day, stress.series);
    const energy = scoreEnergyBank(data, inputs, d, recovery, sleep, stress.minutes);
    if (energy.curve) energySeries.set(day, energy.curve);
    const healthMonitor = scoreHealthMonitor(f, d, inputs, recovery);
    const healthspan = scoreHealthspan(data, f, d, sleep, opts);
    const fitness = scoreFitness(f, d, opts);
    recordOutcomes(f, d, recovery, sleep, trainingLoad);
    out.set(day, {
      recovery,
      sleep,
      training_load: trainingLoad,
      strain_target: strainTarget,
      sleep_planner: planner.row,
      energy_bank: energy.row,
      stress: stress.row,
      health_monitor: healthMonitor,
      healthspan,
      fitness,
    });

    // Fold today's nightly values into the baselines (after scoring today).
    f.hrvB = update(f.hrvB, recovery.inputs.hrv, hrvCfg);
    f.rhrB = update(f.rhrB, recovery.inputs.rhr, restingHRCfg);
    f.respB = update(f.respB, recovery.inputs.resp, respCfg);
    f.skinB = update(f.skinB, d.dm?.nightlyTempC ?? null, skinTempCfg);
    f.efforts.push(d.s1.effort);
    f.prevAcwr = trainingLoad.acwr;
  }

  // ── Journal impact: as of each day, memoised on its inputs ────────────────
  const entries: JournalDay[] = [...journal].map(([day, es]) => ({ day, tags: Object.fromEntries(es.map((e) => [e.tag, e.value])) }));
  const storedImpact = new Map(
    (c.prepare("select day, journal_impact from daily_scores").all() as { day: string; journal_impact: string | null }[]).map((r) => [
      r.day,
      r.journal_impact ? (JSON.parse(r.journal_impact) as JournalImpactRow) : null,
    ]),
  );
  const rows = new Map<string, Stage2Row>();
  const impactsAsOf = new Map<string, TagImpact[]>();
  for (const day of days) {
    const from = addDays(day, -90);
    const inWindow = entries.filter((e) => e.day >= from && e.day < day);
    const outWindow = f.outcomes.filter((o) => o.day > from && o.day <= day);
    const key = sha(JSON.stringify([inWindow, outWindow]));
    const prior = storedImpact.get(day);
    const impacts = prior?.key === key ? prior.impacts : journalImpact(inWindow, outWindow, day);
    impactsAsOf.set(day, impacts);
    rows.set(day, { ...out.get(day)!, journal_impact: { key, impacts } });
  }

  // ── Writes ────────────────────────────────────────────────────────────────
  const cols = STAGE2_COLUMNS;
  const write = c.prepare(
    `update daily_scores set scoring_version = ?, ${cols.map((k) => `${k} = ?`).join(", ")}
     where day = ? and (scoring_version, ${cols.join(", ")}) is not (?, ${cols.map(() => "?").join(", ")})`,
  );
  const series = c.prepare(SERIES_UPSERT);
  const dropEnergy = c.prepare("delete from intraday_series where day = ? and kind = 'energy_bank'");
  const report = c.prepare(
    "insert into reports (period, data) values (?, ?) on conflict(period) do update set data = excluded.data where data is not excluded.data",
  );
  const periods = reportPeriods(f.reportRows);
  c.transaction(() => {
    for (const day of days) {
      const row = rows.get(day)!;
      const values = cols.map((k) => JSON.stringify(row[k]));
      write.run(SCORING_VERSION, ...values, day, SCORING_VERSION, ...values);
      series.run(day, "stress", JSON.stringify(stressSeries.get(day)));
      const eb = energySeries.get(day);
      if (eb) series.run(day, "energy_bank", JSON.stringify(eb));
      else dropEnergy.run(day);
    }
    for (const period of periods) {
      const { end } = periodBounds(period);
      const asOf = end < data.last ? end : data.last;
      report.run(period, JSON.stringify(buildReport(period, f.reportRows, impactsAsOf.get(asOf) ?? [])));
    }
    c.prepare(`delete from reports where period not in (${periods.map(() => "?").join(", ") || "''"})`).run(...periods);
    c.prepare("delete from daily_scores where day < ? or day > ?").run(data.first, data.last);
    c.prepare("delete from intraday_series where day < ? or day > ?").run(data.first, data.last);
    c.prepare("delete from intraday_dirty").run(); // stage 1 has redone these days, and now stage 2 has too
  })();
}

/** Stage 1's cached rows, the per-minute series stage 2 folds, hypnograms and the journal. */
function readInputs(db: Db) {
  const c = db.$client;
  const cached = new Map(
    (
      c.prepare("select day, strain, activities, session_rhr_bpm, recovery from daily_scores").all() as {
        day: string;
        strain: string | null;
        activities: string | null;
        session_rhr_bpm: number | null;
        recovery: string | null;
      }[]
    ).map((r): [string, Cached] => [
      r.day,
      {
        s1: JSON.parse(r.strain!),
        activities: JSON.parse(r.activities ?? "[]"),
        sessionRhr: r.session_rhr_bpm,
        recovery: r.recovery ? JSON.parse(r.recovery) : null,
      },
    ]),
  );
  const seriesOf = (kind: string) =>
    new Map(
      (c.prepare("select day, data from intraday_series where kind = ?").all(kind) as { day: string; data: string }[]).map((r) => [
        r.day,
        JSON.parse(r.data) as (number | null)[],
      ]),
    );
  const journal = groupBy(
    c.prepare("select day, tag, value from journal_entries order by day, tag").all() as { day: string; tag: string; value: number }[],
    (e) => e.day,
  );
  const inputs: Inputs = {
    cached,
    stillHr: seriesOf("still_hr"),
    loadSeries: seriesOf("load"),
    segments: groupBy(
      c.prepare("select session_id sessionId, start_ts startTs, end_ts endTs, stage from sleep_segments order by start_ts").all() as Segment[],
      (s) => s.sessionId,
    ),
    tagOn: (day, tag) => (journal.get(day) ?? []).some((e) => e.tag === tag && e.value > 0),
  };
  return { inputs, journal };
}
