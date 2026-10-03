// Metric detail screens `/metric/[key]` (spec §11 MD1).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { localMidnight } from "../time";
import { cleanup, copyDb, ctxFor, dayAt, seeded, TZ } from "../testing";

import { DETAIL_KEYS, getMetricDetail, rangeStats, STEP_TARGET, WEEKLY_TARGET, type Section } from "./metric";

afterAll(cleanup);

let db: Db;
beforeAll(() => {
  db = seeded();
});

const TODAY = dayAt(179);
const PAST = dayAt(170);
const section = <K extends Section["kind"]>(s: Section[], kind: K) => s.find((x) => x.kind === kind) as Extract<Section, { kind: K }> | undefined;

/** No NaN or ±Infinity anywhere in a view model. */
function finiteEverywhere(v: unknown, path = "vm"): void {
  if (typeof v === "number") expect(Number.isFinite(v), path).toBe(true);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) finiteEverywhere(x, `${path}.${k}`);
}

describe("getMetricDetail", () => {
  it("builds every metric, today and on a past day, with finite numbers and honest empty states", () => {
    for (const key of DETAIL_KEYS)
      for (const day of [TODAY, PAST]) {
        const vm = getMetricDetail(key, day, ctxFor(db));
        finiteEverywhere(vm, `${key}@${day}`);
        if (vm.value.value === null) expect(vm.value.reason).toBe("no_data");
        if (vm.history.value === null) expect(vm.history.reason).toBe("no_data");
        else expect(vm.history.value).toHaveLength(365);
      }
  });

  it("steps: the day's value against its prior 30 days, today a gap in history, hours summing steps_minutes", () => {
    const vm = getMetricDetail("steps", PAST, ctxFor(db));
    const steps = (d: string) => db.$client.prepare("select steps from daily_metrics where day = ?").pluck().get(d) as number;
    expect(vm.value.value).toBe(steps(PAST));
    const prior = Array.from({ length: 30 }, (_, k) => steps(dayAt(169 - k))).filter((x) => x != null);
    expect(vm.average).toBeCloseTo(prior.reduce((a, b) => a + b, 0) / prior.length, 6);
    const hours = section(vm.sections, "hourly")!.hours.value!;
    const start = localMidnight(PAST, TZ);
    const sum = db.$client.prepare("select sum(steps) from steps_minutes where ts >= ? and ts < ?").pluck().get(start, start + 86400) as number;
    expect(hours).toHaveLength(24);
    expect(hours.reduce((a, h) => a + (h.value ?? 0), 0)).toBe(sum);
    expect(vm.chart.reference).toEqual({ y: STEP_TARGET, label: "7,000" });
    expect(section(vm.sections, "weekday")!.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    const today = getMetricDetail("steps", TODAY, ctxFor(db));
    expect(today.soFar).toBe(true);
    expect(today.history.value!.at(-1)!.value).toBeNull();
    // 14:00: the hours after now are gaps, not zeros.
    expect(section(today.sections, "hourly")!.hours.value!.slice(15).every((h) => h.value === null)).toBe(true);
  });

  it("sedentary time: the longest stretch without steps stays inside 07:00-22:00", () => {
    const still = section(getMetricDetail("sedentary_minutes", PAST, ctxFor(db)).sections, "hourly")!.still!;
    const start = localMidnight(PAST, TZ) * 1000;
    expect(still.from).toBeGreaterThanOrEqual(start + 7 * 3600_000);
    expect(still.to).toBeLessThanOrEqual(start + 22 * 3600_000);
    expect(still.minutes).toBe(Math.round((still.to - still.from) / 60_000));
  });

  it("steps goal: the streak runs back from the day, today counting only once it is met", () => {
    const c = copyDb(db);
    const set = c.$client.prepare("update daily_metrics set steps = ? where day = ?");
    for (let k = 1; k <= 40; k++) set.run(k <= 4 ? STEP_TARGET + 500 : 1000, dayAt(179 - k));
    set.run(200, TODAY);
    const g = section(getMetricDetail("steps", TODAY, ctxFor(c)).sections, "goal")!;
    expect(g).toMatchObject({ streak: 4, met: 4, days: 30 });
    expect(g.longest).toBeGreaterThanOrEqual(4);
    set.run(STEP_TARGET, TODAY);
    expect(section(getMetricDetail("steps", TODAY, ctxFor(c)).sections, "goal")!.streak).toBe(5);
  });

  it("calories: each day's parts add up to its total; workouts list the day's exercises", () => {
    const vm = getMetricDetail("calories", PAST, ctxFor(db));
    expect(vm.chart.stack).toBe("calories");
    for (const p of vm.history.value!.filter((x) => x.parts)) expect(p.parts!.active + p.parts!.resting).toBeCloseTo(p.value!, 6);
    const n = db.$client.prepare("select count(*) from exercises where day = ?").pluck().get(PAST) as number;
    expect(section(vm.sections, "workouts")!.items).toHaveLength(n);
  });

  it("active minutes: this week's total and twelve weeks against 150", () => {
    const vm = getMetricDetail("active_minutes", PAST, ctxFor(db));
    const w = section(vm.sections, "weekly")!;
    const sum = db.$client.prepare("select coalesce(sum(value), 0) from daily_values where key = 'active_minutes' and day >= ? and day <= ?").pluck().get(w.week.from, PAST) as number;
    expect(w.week.total).toBeCloseTo(sum, 6);
    expect(w.target).toBe(WEEKLY_TARGET);
    expect(w.weeks).toHaveLength(12);
    expect(w.met).toBe(w.weeks.filter((x) => (x.value ?? 0) >= WEEKLY_TARGET).length);
    expect(section(vm.sections, "intensity")!.rows.map((r) => r.key)).toEqual(["active_minutes", "light_minutes", "sedentary_minutes"]);
  });

  it("weight: the latest reading on or before the day, with its changes and readings", () => {
    const vm = getMetricDetail("weight", PAST, ctxFor(db));
    const latest = db.$client.prepare("select day, weight_kg w from daily_metrics where weight_kg is not null and day <= ? order by day desc limit 1").get(PAST) as { day: string; w: number };
    expect(vm.valueDay).toBe(latest.day);
    expect(vm.value.value).toBe(latest.w);
    expect(vm.chart.smooth).toBe(7);
    expect(section(vm.sections, "readings")!.items[0]).toEqual({ day: latest.day, value: latest.w });
  });

  it("vitals: days outside mean ± 2 SD of the last 90 are listed", () => {
    const c = copyDb(db);
    const put = c.$client.prepare("insert or replace into daily_values (day, key, value) values (?, 'avg_hr', ?)");
    for (let k = 0; k < 90; k++) put.run(dayAt(170 - k), 70 + (k % 3));
    put.run(dayAt(160), 110);
    const vm = getMetricDetail("avg_hr", PAST, ctxFor(c));
    expect(section(vm.sections, "outliers")!.items).toEqual([{ day: dayAt(160), value: 110, dir: "high" }]);
    expect(vm.chart.baseline!.mean).toBeGreaterThan(70);
  });

  it("nutrition: the day's logged entries, eaten vs burned and the protein reference", () => {
    const c = copyDb(db);
    const ts = localMidnight(PAST, TZ) + 13 * 3600;
    c.$client
      .prepare("insert into logged_entries (id, type, ts, day, data, created_at) values ('e1', 'nutrition-log', ?, ?, ?, ?)")
      .run(ts, PAST, JSON.stringify({ meal: "lunch", kcal: 650, proteinG: 30 }), ts);
    const put = c.$client.prepare("insert or replace into daily_values (day, key, value) values (?, ?, ?)");
    put.run(PAST, "calories_in", 2000);
    put.run(PAST, "protein", 90);
    const vm = getMetricDetail("calories_in", PAST, ctxFor(c));
    expect(section(vm.sections, "entries")!.items.map((e) => e.id)).toEqual(["e1"]);
    const burned = c.$client.prepare("select calories from daily_metrics where day = ?").pluck().get(PAST) as number;
    expect(section(vm.sections, "balance")!.rows.find((r) => r.key === "balance")!.metric.value).toBeCloseTo(2000 - burned, 6);
    expect(section(vm.sections, "macros")!.rows.map((r) => r.key)).toContain("protein_target");
  });

  it("is honest when Google has never sent the metric", () => {
    const vm = getMetricDetail("glucose", PAST, ctxFor(db));
    expect(vm.value).toMatchObject({ value: null, reason: "no_data" });
    expect(vm.history).toMatchObject({ value: null, reason: "no_data" });
    expect(vm.sections).toEqual([]);
  });
});

describe("rangeStats", () => {
  it("averages, extremes, total and coverage over the last n, against the n before", () => {
    const days = ["a", "b", "c", "d", "e", "f"];
    expect(rangeStats([1, 3, 5, null, 2, 8], days, 3, true)).toEqual({
      average: 5,
      prior: 3,
      high: { day: "f", value: 8 },
      low: { day: "e", value: 2 },
      total: 10,
      withData: 2,
      days: 3,
    });
    expect(rangeStats([null, null], ["a", "b"], 1, true)).toMatchObject({ average: null, prior: null, high: null, total: null, withData: 0 });
  });
});
