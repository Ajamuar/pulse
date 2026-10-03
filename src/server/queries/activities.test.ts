// The /activities journal: day groups newest first, today always present, and "Show older".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { cleanup, ctxFor, seeded } from "../testing";
import { getActivities } from "./activities";

afterAll(cleanup);

let db: Db;
beforeAll(() => {
  db = seeded();
});

describe("getActivities", () => {
  it("groups the window's workouts by day, newest first, with today leading", () => {
    const vm = getActivities(30, ctxFor(db));
    const days = vm.groups.map((g) => g.day);
    expect(days[0]).toBe(vm.today);
    expect([...days].sort().reverse()).toEqual(days);
    const n = db.$client.prepare("select count(*) from exercises where day > date(?, '-30 days')").pluck().get(vm.today) as number;
    expect(vm.groups.reduce((a, g) => a + g.items.length, 0)).toBe(n);
    for (const g of vm.groups) for (const a of g.items) expect(a.day).toBe(g.day);
    expect(vm.older).toBe(true);
  });

  it("has nothing older once the window covers every workout", () => {
    expect(getActivities(3650, ctxFor(db)).older).toBe(false);
  });
});
