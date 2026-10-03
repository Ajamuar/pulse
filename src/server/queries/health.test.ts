import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { SEED_DAYS } from "../sources/seed/scenario";
import { cleanup, copyDb, ctxFor, dayAt, seeded } from "../testing";
import { getMonitor } from "./health";

afterAll(cleanup);

let db: Db;
beforeAll(() => {
  db = seeded();
});

const today = dayAt(SEED_DAYS - 1);

describe("getMonitor heart rhythm", () => {
  it("lists the seeded ECG readings newest first, with Fitbit's labels, and counts the notification", () => {
    const { ecg, irn } = getMonitor(today, ctxFor(db)).heartRhythm;
    expect(ecg.map((e) => e.label)).toEqual(["Normal sinus rhythm", "Inconclusive: high heart rate", "Normal sinus rhythm"]);
    expect(ecg.map((e) => e.tone)).toEqual(["optimal", "neutral", "optimal"]);
    expect(ecg[0].at).toBeGreaterThan(ecg[1].at);
    expect(ecg[0].avgBpm).toBe(66);
    expect(irn).toMatchObject({ count: 1, latestDay: dayAt(SEED_DAYS - 22) });
  });

  it("shows only what had happened by the selected day", () => {
    const { ecg, irn } = getMonitor(dayAt(SEED_DAYS - 30), ctxFor(db)).heartRhythm;
    expect(ecg).toHaveLength(1);
    expect(irn).toEqual({ count: 0, latestAt: null, latestDay: null });
  });

  it("reads an unknown classification as no result, never as normal", () => {
    const db2 = copyDb(db);
    db2.$client.prepare("insert into health_records (id, kind, ts, day, data) values ('x', 'ecg', 1, ?, ?)").run(today, JSON.stringify({ result: "SOMETHING_NEW" }));
    const x = getMonitor(today, ctxFor(db2)).heartRhythm.ecg.find((e) => e.id === "x")!;
    expect(x).toMatchObject({ label: "No result", tone: "neutral", avgBpm: null });
  });
});

describe("getMonitor measurements", () => {
  it("shows weight and body fat against the readings of the 30 days before, and hides metrics never recorded", () => {
    const m = getMonitor(today, ctxFor(db)).measurements;
    expect(m.map((x) => x.key)).toEqual(["weight", "body_fat"]);
    const w = (d: string) => db.$client.prepare("select weight_kg from daily_metrics where day = ?").pluck().get(d) as number;
    // Monthly weigh-ins on day indexes 2, 32, ... 152: the latest is 152, compared with 122.
    expect(m[0].metric.value).toBe(w(dayAt(152)));
    expect(m[0].average).toBe(w(dayAt(122)));
    expect(m[0].caption).toMatch(/^\w{3}, \w{3} \d+$/);
  });

  it("adds blood glucose and core temperature once there is a value, and says no data before the first", () => {
    const db2 = copyDb(db);
    const put = db2.$client.prepare("insert into daily_values (day, key, value) values (?, ?, ?)");
    put.run(dayAt(170), "glucose", 98);
    put.run(dayAt(175), "glucose", 104);
    put.run(dayAt(176), "core_temp", 36.8);
    const m = getMonitor(today, ctxFor(db2)).measurements;
    expect(m.map((x) => x.key)).toEqual(["weight", "body_fat", "glucose", "core_temp"]);
    expect(m[2]).toMatchObject({ metric: { value: 104 }, average: 98, unit: "mg/dL" });
    expect(m[3].average).toBeNull();
    const before = getMonitor(dayAt(160), ctxFor(db2)).measurements[2];
    expect(before.metric).toMatchObject({ value: null, reason: "no_data" });
  });
});
