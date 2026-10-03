// Strain's activity extras and the distance on activities (spec §11 EX1, EX3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { cleanup, ctxFor, dayAt, seeded } from "../testing";
import { getActivity } from "./activity";
import { activityItem, distanceOf, type ExerciseRow } from "./common";
import { getStrain, STRAIN_EXTRAS } from "./strain";

afterAll(cleanup);

let db: Db;
beforeAll(() => {
  db = seeded();
});

describe("getStrain summary", () => {
  it("lists the extras after Steps with the catalogue's unit, format and direction, and a 30-day average", () => {
    const vm = getStrain(dayAt(178), ctxFor(db));
    expect(vm.summary.map((k) => k.key)).toEqual(["zones13", "zones45", "strength", "steps", ...STRAIN_EXTRAS]);
    const distance = vm.summary.find((k) => k.key === "distance")!;
    expect(distance).toMatchObject({ label: "Distance", unit: "km", format: "decimal2", direction: "up" });
    expect(distance.metric.value).toBeGreaterThan(0);
    expect(distance.average).toBeGreaterThan(0);
    const avg = db.$client
      .prepare("select avg(value) from daily_values where key = 'azm' and day >= ? and day <= ?")
      .pluck()
      .get(dayAt(148), dayAt(177)) as number;
    expect(vm.summary.find((k) => k.key === "azm")!.average).toBeCloseTo(avg, 6);
    expect(vm.summary.find((k) => k.key === "active_calories")!.direction).toBe("neutral");
  });

  it("is honest without a value: band_not_worn on the band-off day, no_data on a worn day the account has none", () => {
    const off = getStrain(dayAt(156), ctxFor(db)).summary.find((k) => k.key === "floors")!;
    expect(off.metric).toMatchObject({ value: null, reason: "band_not_worn" });
    db.$client.prepare("delete from daily_values where day = ? and key = 'floors'").run(dayAt(170));
    const missing = getStrain(dayAt(170), ctxFor(db)).summary.find((k) => k.key === "floors")!;
    expect(missing.metric).toMatchObject({ value: null, reason: "no_data" });
  });
});

describe("activity distance", () => {
  const ex = (type: string, distanceM: number | null): ExerciseRow => ({ id: "x", day: dayAt(1), startTs: 0, endTs: 30 * 60, type, name: null, calories: null, distanceM });

  it("gives km for any recorded distance, pace only for runs and walks, nothing for none or zero", () => {
    expect(distanceOf(ex("RUNNING", 6000))).toEqual({ distanceKm: 6, paceS: 300 });
    expect(distanceOf(ex("WALKING", 2500))).toEqual({ distanceKm: 2.5, paceS: 720 });
    expect(distanceOf(ex("BIKING", 15000))).toEqual({ distanceKm: 15, paceS: null });
    expect(distanceOf(ex("STRENGTH_TRAINING", null))).toEqual({ distanceKm: null, paceS: null });
    expect(distanceOf(ex("RUNNING", 0))).toEqual({ distanceKm: null, paceS: null });
    expect(activityItem(ex("RUNNING", 6000), undefined)).toMatchObject({ distanceKm: 6, paceS: 300 });
  });

  it("the activity screen adds Distance and Pace for a run, Distance for a ride, neither for strength", () => {
    const ctx = ctxFor(db);
    const first = (type: string) => db.$client.prepare("select id from exercises where type = ? order by start_ts desc limit 1").pluck().get(type) as string;
    const keys = (type: string) => getActivity(first(type), ctx)!.stats.map((k) => k.key);
    expect(keys("RUNNING")).toEqual(["duration", "distance", "pace", "avgHr", "maxHr", "calories"]);
    expect(keys("BIKING")).toEqual(["duration", "distance", "avgHr", "maxHr", "calories"]);
    expect(keys("STRENGTH_TRAINING")).toEqual(["duration", "avgHr", "maxHr", "calories"]);
    const run = getActivity(first("RUNNING"), ctx)!.stats;
    expect(run.find((k) => k.key === "pace")).toMatchObject({ unit: "/km", format: "pace" });
    expect(run.find((k) => k.key === "pace")!.metric.value).toBeGreaterThan(180);
    expect(run.find((k) => k.key === "pace")!.average).not.toBeNull();
  });
});
