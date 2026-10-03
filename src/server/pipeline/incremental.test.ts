// The pipeline tests that seed their own databases, apart from pipeline.test.ts so the two files run in parallel.
import { afterAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { lastRun, recompute, type RecoveryRow } from ".";
import { seedPull } from "../sources/seed/generate";
import { localMidnight } from "../time";
import { cleanup, copyDb, DAY_S, dayAt, dump, NOW, OPTS, PROFILE, seeded, TZ } from "../testing";

afterAll(cleanup);

const json = <T>(db: Db, col: string, day: string) =>
  JSON.parse(db.$client.prepare(`select ${col} from daily_scores where day = ?`).pluck().get(day) as string) as T;

describe("recovery updates", () => {
  it("a score that gains a term later is flagged Updated", () => {
    // Today's skin temperature lands 90 minutes after the rest of the night.
    const early = seeded([Date.parse("2026-10-02T08:00:00+05:30") / 1000]);
    const before = json<RecoveryRow>(early, "recovery", dayAt(179));
    expect(before.value).toBeTypeOf("number");
    expect(before.terms).not.toContain("skinTemp");
    seedPull(early, { now: Date.parse("2026-10-02T10:00:00+05:30") / 1000, timeZone: TZ, maxHr: PROFILE.maxHr });
    recompute(early, OPTS);
    const after = json<RecoveryRow>(early, "recovery", dayAt(179));
    expect(after.terms).toContain("skinTemp");
    expect(after.updated).toBe(true);
    expect(json<RecoveryRow>(early, "recovery", dayAt(178)).updated).toBe(false);
  });
});

describe("incremental equals full on 220 days", () => {
  it("a late night for day 200 then an incremental recompute matches a from-scratch recompute byte for byte", () => {
    const base = seeded([NOW - 40 * DAY_S, NOW], { compute: false });
    expect(base.$client.prepare("select count(*) from daily_metrics").pluck().get()).toBe(220);
    const full = copyDb(base);
    const late = copyDb(base);
    const c = late.$client;
    const first = c.prepare("select min(day) from daily_metrics").pluck().get() as string;
    const at = (i: number) => new Date(Date.parse(first) + i * DAY_S * 1000).toISOString().slice(0, 10);
    const day = at(200);

    // Hold back night 200: its session, stages and nightly metrics.
    const session = c.prepare("select * from sleep_sessions where day = ? and is_main = 1").get(day) as Record<string, unknown>;
    const segments = c.prepare("select * from sleep_segments where session_id = ?").all(session.id) as Record<string, unknown>[];
    const metrics = c.prepare("select hrv_ms, hrv_deep_ms, rhr_bpm, rhr_method, resp_bpm, nightly_temp_c, spo2_pct from daily_metrics where day = ?").get(day) as Record<string, unknown>;
    c.prepare("delete from sleep_sessions where id = ?").run(session.id);
    c.prepare("update daily_metrics set hrv_ms = null, hrv_deep_ms = null, rhr_bpm = null, rhr_method = null, resp_bpm = null, nightly_temp_c = null, spo2_pct = null where day = ?").run(day);
    recompute(late, OPTS);
    expect(json<RecoveryRow>(late, "recovery", day).reason).toBe("band_not_worn");

    // The night syncs late: the source writes the rows (no HR changed, so nothing is marked dirty).
    const insert = (table: string, row: Record<string, unknown>) =>
      c.prepare(`insert into ${table} (${Object.keys(row)}) values (${Object.keys(row).map(() => "?")})`).run(...Object.values(row));
    insert("sleep_sessions", session);
    for (const g of segments) insert("sleep_segments", g);
    c.prepare(`update daily_metrics set ${Object.keys(metrics).map((k) => `${k} = ?`)} where day = ?`).run(...Object.values(metrics), day);
    recompute(late, OPTS);
    // Only the days the night touches rerun stage 1: the morning it ended, and the evening before if it started then.
    const startedBefore = (session.start_ts as number) < localMidnight(day, TZ);
    expect(lastRun.stage1Days).toEqual(startedBefore ? [at(199), day] : [day]);

    recompute(full, OPTS);
    expect(dump(late, "daily_scores")).toBe(dump(full, "daily_scores"));
    expect(dump(late, "intraday_series", "1, 2")).toBe(dump(full, "intraday_series", "1, 2"));
    expect(dump(late, "reports")).toBe(dump(full, "reports"));
  }, 60_000);
});
