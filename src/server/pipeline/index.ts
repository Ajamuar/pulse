// The two-stage recompute (KTD6). Stage 1 (stage1.ts) reads the heavy per-sample tables for the days
// whose inputs changed and caches per-day results; stage 2 (stage2.ts, scorers in scores.ts) folds
// every day, oldest first, over daily rows and those cached results. Every value for day D depends
// only on D and earlier days, except where a feature is defined over the evening that follows (Energy
// Bank stops at tonight's bedtime, Stress leaves out tonight's sleep), so adding a later night never
// changes an earlier day's scores.
//
// Determinism: the same database gives byte-identical daily_scores, and writes only touch rows whose
// JSON differs, so an unchanged recompute writes nothing.
import { getConfig } from "../config";
import { type Db, getDb } from "../db";
import { getProfile } from "../profile";
import { load } from "./data";
import { stage1 } from "./stage1";
import { stage2 } from "./stage2";
import { type PipelineOptions, SCORING_VERSION } from "./types";

export * from "./types";

/** What the last run did, for tests and logs. */
export const lastRun = { stage1Days: [] as string[], ms: 0, stage1Ms: 0, stage2Ms: 0 };

/** The worker's hook: recompute when a source changed something, a day is dirty, or the version moved. */
export async function recomputeIfNeeded(changed: boolean): Promise<void> {
  const db = getDb();
  if (!changed && !needsRecompute(db)) return;
  // Scores need age and sex: before onboarding, sync keeps importing and scoring waits.
  const profile = getProfile(db);
  if (!profile) return;
  recompute(db, { timeZone: getConfig().timeZone, profile });
  console.info(`[pipeline] recomputed in ${lastRun.ms} ms (stage 1: ${lastRun.stage1Days.length} days)`);
}

export function needsRecompute(db: Db): boolean {
  const c = db.$client;
  if (c.prepare("select 1 from intraday_dirty limit 1").get()) return true;
  if (c.prepare("select 1 from daily_scores where scoring_version != ? limit 1").get(SCORING_VERSION)) return true;
  const last = c.prepare("select max(day) from daily_metrics").pluck().get() as string | null;
  return last != null && !c.prepare("select 1 from daily_scores where day = ?").get(last);
}

/** Runs both stages. Synchronous: better-sqlite3 is, and the worker never overlaps runs. */
export function recompute(db: Db, opts: PipelineOptions) {
  const t0 = performance.now();
  const data = load(db, opts);
  if (!data) {
    Object.assign(lastRun, { stage1Days: [], ms: Math.round(performance.now() - t0), stage1Ms: 0, stage2Ms: 0 });
    return lastRun;
  }
  const t1 = performance.now();
  lastRun.stage1Days = stage1(db, data, opts);
  const t2 = performance.now();
  stage2(db, data, opts);
  const t3 = performance.now();
  Object.assign(lastRun, { stage1Ms: Math.round(t2 - t1), stage2Ms: Math.round(t3 - t2), ms: Math.round(t3 - t0) });
  return lastRun;
}
