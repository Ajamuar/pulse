import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { type Db, openDb } from "../db";
import { dashboardKeys } from "../queries/home";
import { saveDashboard } from "./dashboard";

const h = vi.hoisted(() => ({ db: undefined as unknown, revalidate: vi.fn(), session: { kind: "demo" } as unknown }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentSession: async () => h.session }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

let dir: string;
let db: Db;
const rows = () => db.$client.prepare("select key, position from dashboard_metrics order by position").all();

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-dashboard-"));
  db = h.db = openDb(path.join(dir, "test.db")) as Db;
});
afterAll(() => {
  db.$client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  db.$client.prepare("delete from dashboard_metrics").run();
  h.revalidate.mockClear();
  h.session = { kind: "demo" };
});

it("signed out, a save is refused and nothing is stored", async () => {
  h.session = null;
  expect(await saveDashboard({ keys: ["steps"] })).toEqual({ ok: false, error: "Signed out. Sign in again." });
  expect(rows()).toEqual([]);
  expect(h.revalidate).not.toHaveBeenCalled();
});

it("saves the chosen metrics in order and revalidates Home", async () => {
  expect(await saveDashboard({ keys: ["steps", "hrv", "sleep"] })).toEqual({ ok: true, data: undefined });
  expect(rows()).toEqual([
    { key: "steps", position: 0 },
    { key: "hrv", position: 1 },
    { key: "sleep", position: 2 },
  ]);
  expect(dashboardKeys(db)).toEqual(["steps", "hrv", "sleep"]);
  expect(h.revalidate).toHaveBeenCalledWith("/");
});

it("rejects unknown, repeated or no metrics, writing nothing", async () => {
  await saveDashboard({ keys: ["hrv"] });
  for (const keys of [["hrv", "vo2max"], ["hrv", "hrv"], [], ["__proto__"]]) expect(await saveDashboard({ keys })).toMatchObject({ ok: false });
  expect(rows()).toEqual([{ key: "hrv", position: 0 }]);
});

it("the default list (Reset to default) is stored as no rows", async () => {
  await saveDashboard({ keys: ["steps"] });
  await saveDashboard({ keys: ["hrv", "rhr", "resp", "sleep", "calories", "steps", "spo2", "skin"] });
  expect(rows()).toEqual([]);
});
