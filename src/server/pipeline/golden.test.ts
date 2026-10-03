// Pinned score fingerprints: one hash per daily_scores column, per intraday series kind and for reports, on the
// pinned 180-day demo database. A scorer change that moves any value fails here, so it must either bump
// SCORING_VERSION (so every install recomputes) and record new fingerprints, or update them on purpose.
import crypto from "node:crypto";
import { expect, it } from "vitest";
import { type Db, rows, sql } from "../db";
import { SCORING_VERSION } from ".";
import { seeded, USER } from "../testing";

/**
 * Fingerprints per SCORING_VERSION. To update: run this test, copy the "Received" object from the failure into
 * GOLDEN[SCORING_VERSION], and say in the commit why the scores moved. Versions before 6 hashed SQLite's JSON text;
 * 6 was re-recorded for Postgres (sorted jsonb keys) with parity.test.ts proving the scores themselves did not move.
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
    "daily_scores.strain": "2d15191be1e01800",
    "daily_scores.activities": "8ec4648986d77601",
    "daily_scores.session_rhr_bpm": "eb0c3b3835b4a988",
    "daily_scores.recovery": "4eb49ca94ef8b8f6",
    "daily_scores.sleep": "db974136aea975df",
    "daily_scores.training_load": "0420f7816b1a7bc0",
    "daily_scores.strain_target": "aa8b917af172cfca",
    "daily_scores.sleep_planner": "8480390059ec9c9b",
    "daily_scores.energy_bank": "2d0646ee9ee12298",
    "daily_scores.stress": "142efc9b0fb45fe6",
    "daily_scores.health_monitor": "1e80d976f9487315",
    "daily_scores.healthspan": "ed171d47c33ed906",
    "daily_scores.fitness": "558d24cdb87efd6c",
    "daily_scores.journal_impact": "0411979e155f266d",
    "intraday_series.energy_bank": "0a0cc856f3987abc",
    "intraday_series.hr": "05de9bb2ba692679",
    "intraday_series.load": "4768ea33442950f0",
    "intraday_series.still_hr": "1f35b44871871769",
    "intraday_series.stress": "a466449cc9fa5819",
    "reports": "827682111128fd2f",
  },
};

// Numbers are rounded to 10 significant digits first, so a last-ulp difference in Math between Node
// versions does not count as a scoring change. Object keys are sorted: jsonb stores them in its own order.
const canon = (v: unknown): unknown =>
  typeof v === "number"
    ? +v.toPrecision(10)
    : Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;
const hash = (rs: Record<string, unknown>[]) =>
  crypto
    .createHash("sha256")
    .update(rs.map((r) => Object.values(r).map((v) => JSON.stringify(canon(v))).join("\t")).join("\n"))
    .digest("hex")
    .slice(0, 16);

async function fingerprints(db: Db) {
  const out: Record<string, string> = {};
  const columns = await rows<{ name: string }>(
    db,
    sql`select column_name as name from information_schema.columns
        where table_name = 'daily_scores' and column_name not in ('day', 'user_id') order by ordinal_position`,
  );
  for (const { name } of columns) {
    out[`daily_scores.${name}`] = hash(await rows(db, sql`select day, ${sql.identifier(name)} from daily_scores where user_id = ${USER} order by day`));
  }
  const kinds = await rows<{ kind: string }>(db, sql`select distinct kind from intraday_series where user_id = ${USER} order by kind`);
  for (const { kind } of kinds) {
    out[`intraday_series.${kind}`] = hash(await rows(db, sql`select day, data from intraday_series where user_id = ${USER} and kind = ${kind} order by day`));
  }
  out.reports = hash(await rows(db, sql`select period, data from reports where user_id = ${USER} order by period`));
  return out;
}

it(`the demo database scores exactly as pinned for SCORING_VERSION ${SCORING_VERSION}`, async () => {
  const actual = await fingerprints(await seeded());
  expect(
    GOLDEN[SCORING_VERSION],
    `no fingerprints for SCORING_VERSION ${SCORING_VERSION}: add GOLDEN[${SCORING_VERSION}] = ${JSON.stringify(actual, null, 2)}`,
  ).toBeDefined();
  expect(actual, "scores changed: bump SCORING_VERSION and record the new fingerprints, or update them if the change is intended").toEqual(
    GOLDEN[SCORING_VERSION],
  );
});
