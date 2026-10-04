// The coach's server side: who has access, keys at rest, chats per user, the per-minute guard, and the tools over a
// seeded database. The chat endpoint has its own test (src/app/api/coach/route.test.ts).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { parseConfig, type Config } from "../config";
import type { Db } from "../db";
import { coachSettings, user } from "../db/schema";
import { addUser, ctxFor, freshDb, seeded, USER } from "../testing";
import { allowRequest, coachAccess, coachModel, coachSetup, listChats, loadChat, saveChat, saveProvider, setCoachAllowed, setCoachMode, setConsent, titleOf } from "./store";
import { coachTools, dayDigest } from "./tools";

const h = vi.hoisted(() => ({ cfg: undefined as unknown }));
vi.mock("../config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
const google = (extra: Record<string, string> = {}) =>
  parseConfig({ DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", BETTER_AUTH_SECRET: "x".repeat(32), ADMIN_EMAILS: "owner@pulse.test", ...extra });

const msg = (id: string, role: "user" | "assistant", text: string): UIMessage => ({ id, role, parts: [{ type: "text", text }] });

describe("access, keys and chats", () => {
  let db: Db;
  let member: number;
  let owner: number;
  beforeEach(async () => {
    h.cfg = google();
    db = await freshDb();
    member = await addUser(db, "member@pulse.test");
    owner = await addUser(db, "owner@pulse.test");
  });

  it("access: off by default; everyone; chosen means picked accounts and owners; never on a demo instance", async () => {
    expect(await coachAccess(db, member)).toBe(false);
    await setCoachMode(db, "everyone");
    expect(await coachAccess(db, member)).toBe(true);
    await setCoachMode(db, "chosen");
    expect(await coachAccess(db, member)).toBe(false);
    expect(await coachAccess(db, owner)).toBe(true);
    await setCoachAllowed(db, member, true);
    expect(await coachAccess(db, member)).toBe(true);
    h.cfg = parseConfig({});
    expect(await coachAccess(db, member)).toBe(false);
  });

  it("the model needs access, then consent, then a key; the key is stored encrypted and never handed back", async () => {
    expect(await coachModel(db, member)).toEqual({ problem: "no_access" });
    await setCoachMode(db, "everyone");
    expect(await coachModel(db, member)).toEqual({ problem: "no_consent" });
    await setConsent(db, member, true);
    expect(await coachModel(db, member)).toEqual({ problem: "no_key" });

    await saveProvider(db, member, "openai", "gpt-5.4-mini", "sk-secret-key-1234");
    const [row] = await db.select().from(coachSettings).where(eq(coachSettings.userId, member));
    expect(row.keyCiphertext!.includes(Buffer.from("sk-secret-key-1234"))).toBe(false);
    expect(await coachSetup(db, member)).toEqual({ provider: "openai", model: "gpt-5.4-mini", last4: "1234", consent: true });
    expect(JSON.stringify(await coachSetup(db, member))).not.toContain("sk-secret");
    expect("model" in (await coachModel(db, member))).toBe(true);

    // A rotated BETTER_AUTH_SECRET can't read the old key: the user is asked again, nothing is guessed.
    h.cfg = google({ BETTER_AUTH_SECRET: "y".repeat(32) });
    expect(await coachModel(db, member)).toEqual({ problem: "key_unreadable" });
  });

  it("chats belong to one user: same id, other user, nothing loads; titles come from the first question", async () => {
    await saveChat(db, member, "chat-0001", [msg("m1", "user", "Why is my recovery low today?"), msg("m2", "assistant", "…")]);
    expect(await loadChat(db, member, "chat-0001")).toHaveLength(2);
    expect(await loadChat(db, owner, "chat-0001")).toBeNull();
    expect(await listChats(db, owner)).toEqual([]);
    expect((await listChats(db, member))[0].title).toBe("Why is my recovery low today?");
    expect(titleOf([msg("a", "user", "x".repeat(80))])).toHaveLength(60);
    // Deleting the account takes its chats and key with it.
    await setConsent(db, member, true);
    await db.delete(user).where(eq(user.id, member));
    expect(await loadChat(db, member, "chat-0001")).toBeNull();
    expect(await coachSetup(db, member)).toEqual({ provider: null, model: null, last4: null, consent: false });
  });

  it("the per-minute guard allows 10 requests a minute per user", () => {
    const t = 1_000_000;
    for (let i = 0; i < 10; i++) expect(allowRequest(424242, t + i)).toBe(true);
    expect(allowRequest(424242, t + 10)).toBe(false);
    expect(allowRequest(424243, t + 10)).toBe(true);
    expect(allowRequest(424242, t + 61_000)).toBe(true);
  });
});

describe("tools over seeded data", () => {
  let db: Db;
  beforeAll(async () => {
    h.cfg = google();
    db = await seeded();
  });

  it("get_day: the day's scores with reasons instead of guesses, and never a future day", async () => {
    const ctx = ctxFor(db);
    const today = await dayDigest(ctx, "2026-10-02");
    expect(today.recovery).toMatchObject({ unit: "%" });
    expect(typeof today.strain.value === "number" || today.strain.value === null).toBe(true);
    for (const m of [today.recovery, today.sleep.performance, today.strain]) {
      if (m.value === null) expect((m as { reason?: string }).reason).toBeTruthy();
    }
    const tools = coachTools(ctx);
    const future = (await tools.get_day.execute!({ day: "2030-01-01" }, { toolCallId: "t", messages: [] } as never)) as { day: string };
    expect(future.day).toBe("2026-10-02");
  });

  it("every tool runs on real data, and the profile never carries a name or email", async () => {
    const tools = coachTools(ctxFor(db));
    const opts = { toolCallId: "t", messages: [] } as never;
    await expect(tools.get_trend.execute!({ metric: "recovery" }, opts)).resolves.toMatchObject({ metric: expect.any(String) });
    await expect(tools.get_activities.execute!({ days: 14 }, opts)).resolves.toBeInstanceOf(Array);
    await expect(tools.get_journal_impacts.execute!({ outcome: "recovery" }, opts)).resolves.toMatchObject({ outcome: "recovery" });
    await expect(tools.get_health.execute!({}, opts)).resolves.toMatchObject({ day: "2026-10-02" });
    await expect(tools.get_report.execute!({ kind: "week" }, opts)).resolves.toBeDefined();
    const profile = JSON.stringify(await tools.get_profile.execute!({}, opts));
    expect(profile).not.toMatch(/@|test user/i);
    expect(JSON.parse(profile)).toMatchObject({ sex: "male", timeZone: "Asia/Kolkata" });
  });

  it("another user's tools see none of this user's data", async () => {
    const other = await addUser(db, "other@pulse.test");
    const d = await dayDigest(ctxFor(db, undefined, other), "2026-10-02");
    expect(d.recovery.value).toBeNull();
    expect(d.strain.value === null || d.strain.value === 0).toBe(true);
    expect(USER).not.toBe(other);
  });
});
