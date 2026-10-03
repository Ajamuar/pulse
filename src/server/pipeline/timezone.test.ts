// A change of TZ moves every day's bounds; its own file so its two full recomputes run beside pipeline.test.ts.
import { afterAll, expect, it } from "vitest";
import type { Db } from "../db";
import { lastRun, recompute } from ".";
import { cleanup, copyDb, dump, OPTS, seeded } from "../testing";

afterAll(cleanup);

const days = (db: Db) => db.$client.prepare("select day from daily_scores order by day").pluck().all() as string[];

it("a time-zone change reruns stage 1 for every day and matches a from-scratch run in the new zone", () => {
  const utc = { ...OPTS, timeZone: "UTC" };
  const moved = seeded();
  recompute(moved, utc);
  const rerun = lastRun.stage1Days;
  const scratch = copyDb(moved);
  scratch.$client.exec("delete from daily_scores; delete from intraday_series; delete from reports");
  recompute(scratch, utc);
  expect(rerun).toEqual(days(scratch));
  expect(dump(moved, "daily_scores")).toBe(dump(scratch, "daily_scores"));
  expect(dump(moved, "intraday_series", "1, 2")).toBe(dump(scratch, "intraday_series", "1, 2"));
});
