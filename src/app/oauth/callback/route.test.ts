import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAccount } from "@/server/account";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { exercises, instance, journalEntries, oauthTokens } from "@/server/db/schema";
import { SESSION_COOKIE, signSession } from "@/server/session";
import { createState } from "@/server/sources/google/oauth";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, requestSync: vi.fn() }));
vi.mock("@/server/worker", () => ({ requestSync: h.requestSync }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = { TZ: "Asia/Kolkata" };
const googleEnv = { GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" };
const live = parseConfig({ ...env, ...googleEnv, APP_URL: "https://pulse.example.com" });

const idToken = (email: string) =>
  ["{}", JSON.stringify({ aud: "cid", email, email_verified: true, picture: "https://lh3.googleusercontent.com/a/me" })].map((p) => Buffer.from(p).toString("base64url")).join(".") + ".sig";

let db: Db;
let cookie: string | undefined;
let tokenResponse: () => Response;
const fetchMock = vi.fn<typeof fetch>(async () => tokenResponse());
const errors = vi.spyOn(console, "error").mockImplementation(() => {});
const granted = (email = "fit@gmail.com") => () =>
  new Response(JSON.stringify({ access_token: "at-NEW", refresh_token: "rt-NEW", expires_in: 3600, id_token: idToken(email) }));

const call = (q: Record<string, string>) =>
  GET(new NextRequest(`http://pulse:3000/oauth/callback?${new URLSearchParams(q)}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} }));
const tokens = () => db.select().from(oauthTokens).all();
const row = () => db.select().from(instance).get()!;
const SETTINGS = "https://pulse.example.com/settings?oauth=";

beforeEach(async () => {
  db = openDb(":memory:");
  h.db = db;
  h.cfg = live;
  tokenResponse = granted();
  vi.stubGlobal("fetch", fetchMock);
  await saveAccount(db, "me@example.com", "correct horse battery");
  cookie = await signSession(db, { kind: "owner", email: "me@example.com" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /oauth/callback", () => {
  it("is a 404 on a demo instance", async () => {
    h.cfg = parseConfig(env);
    expect((await call({ state: createState(), code: "c" })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a missing, wrong, expired or reused state is a 400 that touches nothing", async () => {
    expect((await call({ code: "c" })).status).toBe(400);
    expect((await call({ state: "forged", code: "c" })).status).toBe(400);
    expect((await call({ state: createState(Date.now() - 10 * 60_000 - 1), code: "c" })).status).toBe(400);
    const state = createState();
    expect((await call({ state, code: "c" })).status).toBe(302);
    expect((await call({ state, code: "c" })).status).toBe(400);
    // One connect: the token exchange and the Google Health identity check.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("without a Pulse session: /login, no token request, nothing stored", async () => {
    cookie = undefined;
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/login");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tokens()).toEqual([]);
  });

  it("stores the grant and the Google email, starts the import and lands on Settings; the session is untouched", async () => {
    const res = await call({ state: createState(), code: "c0de" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${SETTINGS}connected`);
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.get("code")).toBe("c0de");
    expect(body.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
    expect(tokens()).toMatchObject([{ accessToken: "at-NEW", refreshToken: "rt-NEW", revokedAt: null }]);
    expect(h.requestSync).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(row()).toMatchObject({ googleEmail: "fit@gmail.com", ownerEmail: "me@example.com", ownerPicture: "https://lh3.googleusercontent.com/a/me" });
  });

  it("without APP_URL, redirects go back to the host the request came in on", async () => {
    h.cfg = parseConfig({ ...env, ...googleEnv });
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("http://pulse:3000/settings?oauth=connected");
    expect(new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body)).get("redirect_uri")).toBe("http://pulse:3000/oauth/callback");
  });

  it("switching to another Google account clears the old account's synced data and keeps the journal", async () => {
    await call({ state: createState(), code: "c" });
    db.insert(exercises).values({ id: "x", day: "2026-09-01", startTs: 1, endTs: 2, type: "WALKING", source: "google" }).run();
    db.insert(journalEntries).values({ day: "2026-09-01", tag: "alcohol", value: 1 }).run();
    await call({ state: createState(), code: "c" }); // same account again: nothing cleared
    expect(db.select().from(exercises).all()).toHaveLength(1);
    tokenResponse = granted("other@gmail.com");
    await call({ state: createState(), code: "c" });
    expect(db.select().from(exercises).all()).toEqual([]);
    expect(db.select().from(journalEntries).all()).toHaveLength(1);
    expect(row().googleEmail).toBe("other@gmail.com");
  });

  it("a token error lands on Settings with its code, never logging Google's detail", async () => {
    tokenResponse = () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "SECRET-DETAIL" }), { status: 400 });
    const bad = await call({ state: createState(), code: "c" });
    expect(bad.headers.get("location")).toBe(`${SETTINGS}invalid_grant`);
    expect(errors.mock.calls.flat().join(" ")).not.toContain("SECRET-DETAIL");
  });

  it("no refresh_token and no working grant: auth_revoked, without logging the token", async () => {
    db.insert(oauthTokens).values({ id: 1, accessToken: "at-old", refreshToken: "rt-old", expiresAt: 1, scope: "s", updatedAt: 1, revokedAt: 1 }).run();
    const before = tokens();
    tokenResponse = () => new Response(JSON.stringify({ access_token: "at-NEW", expires_in: 3600, id_token: idToken("fit@gmail.com") }));
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}auth_revoked`);
    expect(tokens()).toEqual(before);
    expect(String(errors.mock.calls[0][0])).toContain("auth_revoked");
    expect(String(errors.mock.calls[0][0])).not.toContain("at-NEW");
  });

  it("an account without Google Health stores nothing", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/identity")
        ? new Response(JSON.stringify({ error: { details: [{ reason: "ACCOUNT_NOT_LINKED" }] } }), { status: 400 })
        : tokenResponse(),
    );
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}account_not_linked`);
    expect(tokens()).toEqual([]);
    expect(row().googleEmail).toBeNull();
    fetchMock.mockImplementation(async () => tokenResponse());
  });

  it("a denied consent returns to Settings without a token request", async () => {
    const res = await call({ state: createState(), error: "access_denied" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}access_denied`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a network failure logs the error name only", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed at-SECRET"));
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe(`${SETTINGS}error`);
    expect(errors.mock.calls.flat().join(" ")).toBe("[oauth] callback failed: TypeError");
  });
});
