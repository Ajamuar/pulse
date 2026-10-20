import { beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addUser, ctxFor, freshDb, seeded, USER } from "../testing";
import type { Db } from "../db";
import { dailyMetrics, dailyScores, loggedEntries } from "../db/schema";
import { coachTools, sleepDigest, trendDigest } from "./tools";
import { coachSuggestions } from "./suggestions";

let db: Db;
beforeAll(async () => { db = await seeded(); });
const opts = { toolCallId: "t", messages: [] } as never;

it("trend ranges preserve daily gaps, units and equal-length previous periods", async () => {
  const empty = await freshDb();
  await empty.insert(dailyScores).values([
    { userId: USER, day: "2026-09-28", scoringVersion: 1, recovery: { value: 40, reason: null, provisional: false } },
    { userId: USER, day: "2026-10-01", scoringVersion: 1, recovery: { value: 80, reason: null, provisional: true } },
  ]);
  const r = await trendDigest(ctxFor(empty), "recovery", "2026-09-30", "2026-10-02");
  expect(r.points.map((p) => p.value)).toEqual([null, 80, null]);
  expect(r.points[1].provisional).toBe(true);
  expect(r).toMatchObject({ unit: "%", observedDays: 1, calendarDays: 3, average: { value: 80 }, previous: { start: "2026-09-27", end: "2026-09-29", observedDays: 1, average: { value: 40 } } });
  expect((await trendDigest(ctxFor(db), "hours")).unit).toBe("min");
});

it("trend windows cap size, clamp future dates and exclude accumulating partial-day metrics", async () => {
  const r = await trendDigest(ctxFor(db), "strain", "2020-01-01", "2030-01-01");
  expect(r.calendarDays).toBe(90);
  expect(r.end).toBe("2026-10-02");
  expect(r.points.at(-1)).toMatchObject({ day: "2026-10-02", value: null, excludedPartialDay: true });
  expect((await trendDigest(ctxFor(db), "recovery", "2030-01-01")).calendarDays).toBe(1);
});

it("sleep exposes measured detail and a separate, dated bedtime plan", async () => {
  const s = await sleepDigest(ctxFor(db), "2026-10-02");
  expect(s.summary.map((v) => v.key)).toContain("efficiency");
  expect(s.summary.map((v) => v.key)).toContain("consistency");
  expect(s.details.map((v) => v.key)).toContain("debt");
  expect(s.planner.value?.plans).toHaveLength(3);
  expect(s.timeZone).toBe("Asia/Kolkata");
  expect(s.asleepMinutes.value).toBeGreaterThan(0);
});

it("workout detail is reachable from the list but cannot read another user's workout", async () => {
  const tools = coachTools(ctxFor(db));
  const list = await tools.get_activities.execute!({ days: 14 }, opts) as { workouts: { id: string }[] };
  expect(list.workouts.length).toBeGreaterThan(0);
  const detail = await tools.get_activity.execute!({ id: list.workouts[0].id }, opts) as { workout: { zones: unknown; stats: unknown[] } };
  expect(detail.workout.stats.length).toBeGreaterThan(0);
  expect(detail.workout.zones).toHaveProperty("reason");
  const other = await addUser(db);
  expect(await coachTools(ctxFor(db, undefined, other)).get_activity.execute!({ id: list.workouts[0].id }, opts)).toMatchObject({ workout: null, reason: "no_data" });
});

it("a historical health result is unaffected by later fitness and healthspan values", async () => {
  const historyDb = await seeded();
  const tools = coachTools(ctxFor(historyDb));
  const before = await tools.get_health.execute!({ day: "2026-09-15" }, opts);
  await historyDb.update(dailyScores).set({ fitness: { reason: null, vo2max: 99 }, healthspan: { reason: null, pulseAge: 99 } }).where(eq(dailyScores.day, "2026-10-02"));
  expect(await tools.get_health.execute!({ day: "2026-09-15" }, opts)).toEqual(before);
});

it("suggestion baselines exclude today's HRV", async () => {
  const empty = await freshDb();
  await empty.insert(dailyMetrics).values([
    { userId: USER, day: "2026-10-01", hrvMs: 60, source: "demo" },
    { userId: USER, day: "2026-10-02", hrvMs: 50, source: "demo" },
  ]);
  expect((await coachSuggestions(ctxFor(empty))).map((s) => s.key)).toContain("hrv");
});

it("get_log reads this user's meals, moods and symptoms, and no one else's", async () => {
  const logDb = await freshDb();
  const other = await addUser(logDb);
  const at = (iso: string) => Date.parse(iso) / 1000;
  await logDb.insert(loggedEntries).values([
    { userId: USER, id: "food", type: "nutrition-log", ts: at("2026-10-02T08:10:00+05:30"), day: "2026-10-02", data: { name: "Poha", meal: "BREAKFAST", kcal: 320, protein: 8, carbs: 58, fat: 7 }, createdAt: 0 },
    { userId: USER, id: "mood", type: "moods", ts: at("2026-10-01T21:00:00+05:30"), day: "2026-10-01", data: { moods: ["CALM"], valence: "PLEASANT" }, createdAt: 0 },
    { userId: USER, id: "cycle", type: "symptoms", ts: at("2026-10-02T09:00:00+05:30"), day: "2026-10-02", data: { symptoms: ["CRAMPS"] }, createdAt: 0 },
    { userId: USER, id: "ache", type: "symptoms", ts: at("2026-10-02T09:05:00+05:30"), day: "2026-10-02", data: { symptoms: ["HEADACHE"] }, createdAt: 0 },
    { userId: other, id: "theirs", type: "nutrition-log", ts: at("2026-10-02T08:10:00+05:30"), day: "2026-10-02", data: { name: "Secret", meal: "LUNCH", kcal: 1, protein: null, carbs: null, fat: null }, createdAt: 0 },
  ]);
  const out = await coachTools(ctxFor(logDb)).get_log.execute!({ days: 7 }, opts) as {
    days: { day: string; food: { name: string | null; meal: string; kcal: number; at: string }[]; moods: { moods: string[]; valence: string; at: string }[]; symptoms: { symptoms: string[] }[] }[];
  };
  expect(out.days.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02"]);
  expect(JSON.stringify(out)).not.toContain("Secret");
  expect(JSON.stringify(out)).not.toContain("CRAMPS");
  expect(out.days[1].food[0]).toMatchObject({ name: "Poha", meal: "BREAKFAST", kcal: 320, at: "08:10" });
  expect(out.days[0].moods[0]).toMatchObject({ moods: ["CALM"], valence: "PLEASANT", at: "21:00" });
  expect(out.days[1].symptoms).toEqual([{ at: "09:05", symptoms: ["HEADACHE"] }]);
});

it("habit results retain sample sizes, uncertainty and insufficient-data counts", async () => {
  const result = await coachTools(ctxFor(db)).get_journal_impacts.execute!({ outcome: "hrv" }, opts) as { unit: string; effects: object[]; needsMoreData: object[] };
  expect(result.unit).toBe("SD");
  for (const effect of result.effects) expect(effect).toMatchObject({ yesDays: expect.any(Number), noDays: expect.any(Number), confidenceInterval: expect.any(Array), effect: expect.any(String) });
  for (const item of result.needsMoreData) expect(item).toMatchObject({ yesDays: expect.any(Number), noDays: expect.any(Number) });
});
