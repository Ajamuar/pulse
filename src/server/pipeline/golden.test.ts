// Pinned score fingerprints: one hash per daily_scores column, per intraday series kind and for reports, on the
// pinned 180-day demo database. A scorer change that moves any value fails here, so it must either bump
// SCORING_VERSION (so every install recomputes) and record new fingerprints, or update them on purpose.
import crypto from "node:crypto";
import { afterAll, expect, it } from "vitest";
import type { Db } from "../db";
import { SCORING_VERSION } from ".";
import { cleanup, seeded } from "../testing";

afterAll(cleanup);

/**
 * Fingerprints per SCORING_VERSION. To update: run this test, copy the "Received" object from the failure into
 * GOLDEN[SCORING_VERSION], and say in the commit why the scores moved.
 */
const GOLDEN: Record<number, Record<string, string>> = {
  4: {
    "daily_scores.scoring_version": "7127cc4d409f56c8",
    "daily_scores.strain": "0142128af067d3d9",
    "daily_scores.activities": "73a473e0117e7634",
    "daily_scores.session_rhr_bpm": "eb0c3b3835b4a988",
    "daily_scores.recovery": "48b659063a72ca94",
    "daily_scores.sleep": "4760e092b846b6d0",
    "daily_scores.training_load": "bee5c4c4e8f6fd4e",
    "daily_scores.strain_target": "ee29a80d51723fb7",
    "daily_scores.sleep_planner": "5a6e94255768f61a",
    "daily_scores.energy_bank": "dabfb4821ce758b4",
    "daily_scores.stress": "f07e69608121ab9e",
    "daily_scores.health_monitor": "3186093d465c5164",
    "daily_scores.healthspan": "c6a1e21fa34d302b",
    "daily_scores.fitness": "271fe91d5f634fef",
    "daily_scores.journal_impact": "96829f8a2aa64e1c",
    "intraday_series.energy_bank": "e2d63643740bc4f3",
    "intraday_series.hr": "05de9bb2ba692679",
    "intraday_series.load": "5015ada146270d7c",
    "intraday_series.still_hr": "1f35b44871871769",
    "intraday_series.stress": "a466449cc9fa5819",
    reports: "1c262d6fb0d39aba",
  },
  5: {
    "daily_scores.scoring_version": "aa80152d5fba63f3",
    "daily_scores.strain": "69517e5973ce141f",
    "daily_scores.activities": "73a473e0117e7634",
    "daily_scores.session_rhr_bpm": "eb0c3b3835b4a988",
    "daily_scores.recovery": "48b659063a72ca94",
    "daily_scores.sleep": "4760e092b846b6d0",
    "daily_scores.training_load": "bee5c4c4e8f6fd4e",
    "daily_scores.strain_target": "ee29a80d51723fb7",
    "daily_scores.sleep_planner": "5a6e94255768f61a",
    "daily_scores.energy_bank": "dabfb4821ce758b4",
    "daily_scores.stress": "f07e69608121ab9e",
    "daily_scores.health_monitor": "3186093d465c5164",
    "daily_scores.healthspan": "f995aedb11fa6e2a",
    "daily_scores.fitness": "271fe91d5f634fef",
    "daily_scores.journal_impact": "96829f8a2aa64e1c",
    "intraday_series.energy_bank": "e2d63643740bc4f3",
    "intraday_series.hr": "05de9bb2ba692679",
    "intraday_series.load": "5015ada146270d7c",
    "intraday_series.still_hr": "1f35b44871871769",
    "intraday_series.stress": "a466449cc9fa5819",
    "reports": "1c262d6fb0d39aba",
  },
  6: {
    "daily_scores.scoring_version": "d2623305a0334fca",
    "daily_scores.strain": "ff7f85723cb52419",
    "daily_scores.activities": "757bad385af1b4c7",
    "daily_scores.session_rhr_bpm": "eb0c3b3835b4a988",
    "daily_scores.recovery": "1aa1b92422f81ffe",
    "daily_scores.sleep": "4760e092b846b6d0",
    "daily_scores.training_load": "955bde082885c509",
    "daily_scores.strain_target": "db1988adcef53c7a",
    "daily_scores.sleep_planner": "f9eaa6d2cce0b378",
    "daily_scores.energy_bank": "cbae8c842566aba5",
    "daily_scores.stress": "f07e69608121ab9e",
    "daily_scores.health_monitor": "f19525e204e7c6b3",
    "daily_scores.healthspan": "37a62f1ac417c820",
    "daily_scores.fitness": "271fe91d5f634fef",
    "daily_scores.journal_impact": "de10ad120046a0e5",
    "intraday_series.energy_bank": "0a0cc856f3987abc",
    "intraday_series.hr": "05de9bb2ba692679",
    "intraday_series.load": "4768ea33442950f0",
    "intraday_series.still_hr": "1f35b44871871769",
    "intraday_series.stress": "a466449cc9fa5819",
    "reports": "b1f7de6a827fbf74",
  },
};

// Numbers are rounded to 10 significant digits first, so a last-ulp difference in Math between Node
// versions does not count as a scoring change.
const round = (text: string) => JSON.stringify(JSON.parse(text, (_, v) => (typeof v === "number" ? +v.toPrecision(10) : v)));
const hash = (rows: unknown[][]) =>
  crypto
    .createHash("sha256")
    .update(rows.map((r) => r.map((v) => (typeof v === "string" && /^[[{]/.test(v) ? round(v) : JSON.stringify(v))).join("\t")).join("\n"))
    .digest("hex")
    .slice(0, 16);

function fingerprints(db: Db) {
  const c = db.$client;
  const out: Record<string, string> = {};
  const columns = c.prepare("select name from pragma_table_info('daily_scores') where name != 'day'").pluck().all() as string[];
  for (const col of columns) out[`daily_scores.${col}`] = hash(c.prepare(`select day, "${col}" from daily_scores order by day`).raw().all() as unknown[][]);
  for (const kind of c.prepare("select distinct kind from intraday_series order by kind").pluck().all() as string[]) {
    out[`intraday_series.${kind}`] = hash(c.prepare("select day, data from intraday_series where kind = ? order by day").raw().all(kind) as unknown[][]);
  }
  out.reports = hash(c.prepare("select * from reports order by 1, 2").raw().all() as unknown[][]);
  return out;
}

it(`the demo database scores exactly as pinned for SCORING_VERSION ${SCORING_VERSION}`, () => {
  const actual = fingerprints(seeded());
  expect(
    GOLDEN[SCORING_VERSION],
    `no fingerprints for SCORING_VERSION ${SCORING_VERSION}: add GOLDEN[${SCORING_VERSION}] = ${JSON.stringify(actual, null, 2)}`,
  ).toBeDefined();
  expect(actual, "scores changed: bump SCORING_VERSION and record the new fingerprints, or update them if the change is intended").toEqual(
    GOLDEN[SCORING_VERSION],
  );
});
