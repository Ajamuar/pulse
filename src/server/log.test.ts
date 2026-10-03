import { beforeEach, describe, expect, it, vi } from "vitest";
import { scopeUrl } from "@/lib/log";
import { openDb, type Db } from "./db";
import { dailyValues, loggedEntries, oauthTokens, syncState } from "./db/schema";
import { deleteEntry, logAccess, recentEntries, saveEntries, waterOn, type LogWriter } from "./log";
import { GoogleError } from "./sources/google/oauth";

const TZ = "Asia/Kolkata";
const T = Date.parse("2026-10-02T06:00:00Z") / 1000; // Oct 2, 11:30 local
const NAME = "users/1/dataTypes/moods/dataPoints/p1";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});

const fake = (o: Partial<LogWriter> = {}) => ({ create: vi.fn(async () => NAME), batchDelete: vi.fn(async () => {}), ...o }) satisfies LogWriter;
const grant = (scopes: string[], revokedAt: number | null = null) =>
  db.insert(oauthTokens).values({ id: 1, accessToken: "a", refreshToken: "r", expiresAt: T + 3600, scope: scopes.join(" "), revokedAt, updatedAt: T }).run();

describe("logAccess", () => {
  it("demo everywhere in demo mode; not connected without a grant", () => {
    expect(logAccess(db, "demo").moods).toBe("demo");
    expect(logAccess(db, "google").moods).toBe("not_connected");
  });

  it("an older grant writes water and food (nutrition.writeonly) but needs a reconnect for the rest", () => {
    grant([scopeUrl("hydration-log")]);
    const a = logAccess(db, "google");
    expect([a["hydration-log"], a["nutrition-log"], a.weight, a.moods, a.symptoms, a["menstrual-period"]]).toEqual(["ok", "ok", "reconnect", "reconnect", "reconnect", "reconnect"]);
  });

  it("a revoked grant needs a reconnect", () => {
    grant([scopeUrl("moods")], T);
    expect(logAccess(db, "google").moods).toBe("reconnect");
  });
});

describe("saveEntries / deleteEntry", () => {
  it("writes to Google, stores the name, and deletes at Google then here", async () => {
    const w = fake();
    expect(await saveEntries(db, [{ type: "moods", ts: T, data: { moods: ["CALM"], valence: "PLEASANT" } }], { tz: TZ, writer: w, now: T })).toEqual({ ok: true });
    expect(w.create).toHaveBeenCalledWith("moods", { moods: expect.objectContaining({ moods: ["CALM"], valences: ["PLEASANT"] }) });
    const [row] = db.select().from(loggedEntries).all();
    expect(row).toMatchObject({ type: "moods", ts: T, day: "2026-10-02", googleName: NAME, data: { moods: ["CALM"], valence: "PLEASANT" } });

    expect(await deleteEntry(db, row.id, w)).toEqual({ ok: true, type: "moods" });
    expect(w.batchDelete).toHaveBeenCalledWith("moods", [NAME]);
    expect(db.select().from(loggedEntries).all()).toEqual([]);
  });

  it("demo (no writer) keeps entries locally only", async () => {
    await saveEntries(db, [{ type: "symptoms", ts: T, data: { symptoms: ["HEADACHE"] } }], { tz: TZ, writer: null, now: T });
    expect(db.select().from(loggedEntries).get()?.googleName).toBeNull();
    expect(recentEntries(db, T - 60)).toMatchObject([{ type: "symptoms", title: "Symptoms", detail: "Headache", atGoogle: false }]);
  });

  it("a 403 asks for a reconnect and stores nothing; other Google errors fail softly", async () => {
    const denied = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await saveEntries(db, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: denied, now: T })).toEqual({
      ok: false,
      reason: "reconnect",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = fake({ create: vi.fn(async () => Promise.reject(new GoogleError("http_503", 503))) });
    expect(await saveEntries(db, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: down, now: T })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(db.select().from(loggedEntries).all()).toEqual([]);
  });

  it("a delete Google no longer knows still deletes here; a failing one keeps the row", async () => {
    await saveEntries(db, [{ type: "moods", ts: T, data: { moods: ["SAD"], valence: null } }], { tz: TZ, writer: fake(), now: T });
    const id = db.select().from(loggedEntries).get()!.id;
    const denied = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("PERMISSION_DENIED", 403))) });
    expect(await deleteEntry(db, id, denied)).toEqual({ ok: false, reason: "reconnect" });
    expect(db.select().from(loggedEntries).all()).toHaveLength(1);
    const gone = fake({ batchDelete: vi.fn(async () => Promise.reject(new GoogleError("NOT_FOUND", 404))) });
    expect(await deleteEntry(db, id, gone)).toEqual({ ok: true, type: "moods" });
    expect(db.select().from(loggedEntries).all()).toEqual([]);
  });
});

describe("waterOn", () => {
  it("counts an entry once: pending until the hydration sync, then in Google's roll-up only", async () => {
    await saveEntries(db, [{ type: "hydration-log", ts: T, data: { ml: 250 } }], { tz: TZ, writer: null, now: T });
    expect(waterOn(db, "2026-10-02")).toBe(250); // nothing synced yet
    db.insert(dailyValues).values({ day: "2026-10-02", key: "water", value: 1250 }).run(); // includes the 250
    db.insert(syncState).values({ type: "hydration-log", lastSuccessAt: T + 60 }).run();
    expect(waterOn(db, "2026-10-02")).toBe(1250);
    await saveEntries(db, [{ type: "hydration-log", ts: T + 120, data: { ml: 500 } }], { tz: TZ, writer: null, now: T + 120 });
    expect(waterOn(db, "2026-10-02")).toBe(1750);
    expect(waterOn(db, "2026-10-01")).toBe(0);
  });
});
