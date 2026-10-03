import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveAccount } from "@/server/account";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { oauthTokens } from "@/server/db/schema";
import { SESSION_COOKIE, signSession } from "@/server/session";
import { consumeState, SCOPES } from "@/server/sources/google/oauth";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = { TZ: "Asia/Kolkata" };
const google = { GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" };
let cookie: string | undefined;
const start = (url = "http://192.168.1.10:3000/oauth/start") => GET(new NextRequest(url, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} }));
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(async () => {
  h.db = openDb(":memory:");
  await saveAccount(h.db as Db, "me@example.com", "correct horse battery");
  cookie = await signSession(h.db as Db, { kind: "owner", email: "me@example.com" });
});

describe("GET /oauth/start", () => {
  it("is a 404 on a demo instance", async () => {
    h.cfg = parseConfig(env);
    expect((await start()).status).toBe(404);
  });

  it("needs a Pulse session: signed out goes to /login, nothing issued", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    cookie = undefined;
    const res = await start();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://192.168.1.10:3000/login");
  });

  it("redirects to Google with offline access, consent (no grant yet) and a single-use state", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    const res = await start();
    expect(res.status).toBe(302);
    const url = location(res);
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toMatch(/^openid email profile /);
    // No APP_URL: the redirect follows the host the request came in on.
    expect(url.searchParams.get("redirect_uri")).toBe("http://192.168.1.10:3000/oauth/callback");
    const state = url.searchParams.get("state");
    expect(consumeState(state)).toBe(true);
    expect(consumeState(state)).toBe(false);
  });

  it("APP_URL pins the redirect host", async () => {
    h.cfg = parseConfig({ ...env, ...google, APP_URL: "https://pulse.example.com" });
    expect(location(await start()).searchParams.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
  });

  it("a returning owner with a working grant only picks the account; ?switch=1 always asks for consent", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    (h.db as Db).insert(oauthTokens).values({ id: 1, accessToken: "a", refreshToken: "r", expiresAt: 1, scope: SCOPES.join(" "), updatedAt: 1 }).run();
    expect(location(await start()).searchParams.get("prompt")).toBe("select_account");
    expect(location(await start("http://192.168.1.10:3000/oauth/start?switch=1")).searchParams.get("prompt")).toBe("consent");
  });

  it("a grant missing a newer scope asks for consent again", async () => {
    h.cfg = parseConfig({ ...env, ...google });
    (h.db as Db).insert(oauthTokens).values({ id: 1, accessToken: "a", refreshToken: "r", expiresAt: 1, scope: SCOPES.slice(0, 3).join(" "), updatedAt: 1 }).run();
    expect(location(await start()).searchParams.get("prompt")).toBe("consent");
  });
});
