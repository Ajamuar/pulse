import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { cleanup, copyDb, ctxFor, dayAt, seeded } from "../testing";
import { getSleep } from "./sleep";

afterAll(cleanup);

let db: Db;
beforeAll(() => {
  db = seeded();
});

describe("getSleep", () => {
  it("a normal night has performance, stages that sum to 100%, a need breakdown and ordered bedtimes", () => {
    const vm = getSleep(dayAt(150), ctxFor(db));
    expect(vm.performance.value).toBeGreaterThan(40);
    expect(vm.performance.value).toBeLessThanOrEqual(100);
    const stages = vm.stages!.value!;
    expect(stages.rows.map((r) => r.label)).toEqual(["Awake", "REM", "Light", "Deep"]);
    expect(stages.rows.reduce((a, r) => a + r.pct, 0)).toBeCloseTo(100, 6);
    expect(stages.segments.length).toBeGreaterThan(5);
    expect(stages.bed).toBeLessThan(stages.wake);
    const need = vm.hoursVsNeed.value!;
    expect(need.calibrating).toBe(false);
    expect(need.needMin).toBeCloseTo(need.parts.baselineMin + need.parts.strainMin + need.parts.debtMin - need.parts.napMin, 6);
    expect(vm.summary.map((s) => s.label)).toEqual(["Hours vs. needed", "Sleep consistency", "Sleep efficiency", "Restorative sleep"]);
    expect(vm.summary.every((s) => s.status)).toBe(true);
    const consistency = vm.summary[1].metric.value!;
    expect(consistency).toBeGreaterThan(50);
    expect(consistency).toBeLessThanOrEqual(100);
    const plans = vm.planner.value!.plans;
    expect(plans[0].bedtimeAt).toBeLessThan(plans[1].bedtimeAt);
    expect(plans[1].bedtimeAt).toBeLessThan(plans[2].bedtimeAt);
    expect(vm.insight).toMatch(/^Your sleep was (optimal|sufficient|poor)\./);
    expect(vm.debtTrend.points).toHaveLength(182);
  });

  it("calibrates the need and the planner in the first week", () => {
    const vm = getSleep(dayAt(3), ctxFor(db));
    expect(vm.hoursVsNeed.value?.calibrating).toBe(true);
    expect(vm.hoursVsNeed.value?.needMin).toBe(480);
    expect(vm.planner).toMatchObject({ value: null, reason: "calibrating", nightsLeft: 3 });
  });

  it("band-off nights read 'band not worn'; today before wake reads 'awaiting sleep sync'", () => {
    const off = getSleep(dayAt(156), ctxFor(db));
    expect(off.performance.reason).toBe("band_not_worn");
    expect(off.stages).toMatchObject({ value: null, reason: "band_not_worn" });
    expect(off.hoursVsNeed.reason).toBe("band_not_worn");

    const before = Date.parse("2026-10-02T05:00:00+05:30") / 1000;
    const morning = getSleep(dayAt(179), ctxFor(seeded([before]), before));
    expect(morning.performance.reason).toBe("awaiting_sleep_sync");
    expect(morning.stages).toMatchObject({ value: null, reason: "awaiting_sleep_sync" });
  });

  it("the hours hero is the main sleep's time asleep against the prior 30 nights", () => {
    const vm = getSleep(dayAt(150), ctxFor(db));
    const h = vm.hours.value!;
    expect(h.asleepMin).toBe(vm.hoursVsNeed.value!.asleepMin);
    const prior = Array.from({ length: 30 }, (_, k) => getSleep(dayAt(149 - k), ctxFor(db)).hours.value?.asleepMin).filter((x) => x != null);
    expect(h.average).toBeCloseTo(prior.reduce((a, b) => a + b, 0) / prior.length, 6);
    expect(h.sd).toBeGreaterThan(0);
    // The first night has nothing to compare with.
    expect(getSleep(dayAt(0), ctxFor(db)).hours.value?.average ?? null).toBeNull();
  });

  it("the overnight HR is per minute over the sleep window plus 15 minutes each side", () => {
    const vm = getSleep(dayAt(150), ctxFor(db));
    const { bed, wake, points } = vm.nightHr.value!;
    const stages = vm.stages!.value!;
    expect([bed, wake]).toEqual([stages.bed, stages.wake]);
    expect(points[0].t).toBeLessThanOrEqual(bed - 15 * 60_000);
    expect(points[0].t).toBeGreaterThan(bed - 16 * 60_000);
    expect(points.at(-1)!.t).toBeLessThan(wake + 15 * 60_000);
    expect(points.every((p, i) => i === 0 || p.t - points[i - 1].t === 60_000)).toBe(true);
    const inNight = points.filter((p) => p.t >= bed && p.t < wake && p.v !== null).map((p) => p.v!);
    expect(inNight.length).toBeGreaterThan((wake - bed) / 60_000 / 2);
    expect(Math.min(...inNight)).toBeGreaterThan(30);
    expect(Math.max(...inNight)).toBeLessThan(140);
  });

  it("no sleep: the hero and the HR chart carry the night's reason", () => {
    const off = getSleep(dayAt(156), ctxFor(db));
    expect(off.hours).toMatchObject({ value: null, reason: "band_not_worn" });
    expect(off.nightHr).toMatchObject({ value: null, reason: "band_not_worn" });
    const before = Date.parse("2026-10-02T05:00:00+05:30") / 1000;
    const morning = getSleep(dayAt(179), ctxFor(seeded([before]), before));
    expect(morning.hours.reason).toBe("awaiting_sleep_sync");
    expect(morning.nightHr.reason).toBe("awaiting_sleep_sync");
  });

  it("a night with HR samples wiped reads 'not enough heart-rate data'", () => {
    const copy = copyDb(db);
    const { bed, wake } = getSleep(dayAt(150), ctxFor(copy)).nightHr.value!;
    copy.$client.prepare("delete from hr_samples where ts >= ? and ts < ?").run(bed / 1000, wake / 1000);
    expect(getSleep(dayAt(150), ctxFor(copy)).nightHr).toMatchObject({ value: null, reason: "insufficient_hr_data" });
  });

  it("the short-sleep streak builds sleep debt", () => {
    const debt = (i: number) => getSleep(dayAt(i), ctxFor(db)).details.find((s) => s.key === "debt")!.metric.value!;
    expect(debt(172)).toBeGreaterThan(debt(167) + 60);
  });
});
