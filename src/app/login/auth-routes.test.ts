// POST /login/password and POST /login/setup: the sign-in and account-setup form posts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountOf, issueSetupCode, resetAuthState, saveAccount } from "@/server/account";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { verifySession } from "@/server/session";
import { POST as password } from "./password/route";
import { POST as setup } from "./setup/route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const google = parseConfig({ TZ: "UTC", GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" });
let db: Db;
let code = "";
const post = (fn: (r: Request) => Promise<Response>, url: string, fields: Record<string, string>, headers: Record<string, string> = { origin: "https://pulse.example.com", host: "pulse.example.com" }) =>
  fn(new Request(`https://pulse.example.com${url}`, { method: "POST", body: new URLSearchParams(fields), headers }));
const where = (res: Response) => res.headers.get("location");
const session = async (res: Response) => verifySession(db, /pulse_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1], { googleEnabled: true });
const newCode = () => {
  resetAuthState();
  issueSetupCode({ info: (l: string) => void (code = l.match(/[A-Z2-9]{4}-[A-Z2-9]{4}/)![0]) });
};

beforeEach(() => {
  db = h.db = openDb(":memory:");
  h.cfg = google;
  newCode();
});
afterEach(resetAuthState);

describe("POST /login/setup", () => {
  it("creates the account with the logged code and signs in", async () => {
    const res = await post(setup, "/login/setup", { email: "Me@Example.com", password: "correct horse battery", code });
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/");
    expect(accountOf(db)?.email).toBe("me@example.com");
    expect(await session(res)).toEqual({ kind: "owner", email: "me@example.com" });
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });

  it("refuses a wrong code, a short password and a bad email, creating nothing", async () => {
    expect(where(await post(setup, "/login/setup", { email: "me@example.com", password: "correct horse battery", code: "AAAA-AAAA" }))).toBe("/setup?error=bad_code&email=me%40example.com");
    expect(where(await post(setup, "/login/setup", { email: "me@example.com", password: "short", code }))).toMatch(/error=short_password/);
    expect(where(await post(setup, "/login/setup", { email: "nope", password: "correct horse battery", code }))).toMatch(/error=bad_email/);
    expect(accountOf(db)).toBeNull();
  });

  it("once the account exists it only resets the password, keeping the email, and signs other devices out", async () => {
    await saveAccount(db, "me@example.com", "correct horse battery");
    const res = await post(setup, "/login/setup", { email: "attacker@example.com", password: "a brand new password", code });
    expect(where(res)).toBe("/");
    expect(accountOf(db)?.email).toBe("me@example.com");
    expect(where(await post(password, "/login/password", { email: "me@example.com", password: "correct horse battery" }))).toMatch(/bad_credentials/);
  });

  it("a code works once", async () => {
    await post(setup, "/login/setup", { email: "me@example.com", password: "correct horse battery", code });
    expect(where(await post(setup, "/login/setup", { password: "another long password", code }))).toMatch(/error=bad_code/);
  });
});

describe("POST /login/password", () => {
  beforeEach(() => saveAccount(db, "me@example.com", "correct horse battery"));

  it("signs in with the right email and password, in any email case", async () => {
    const res = await post(password, "/login/password", { email: " ME@example.com", password: "correct horse battery" });
    expect(where(res)).toBe("/");
    expect(await session(res)).toEqual({ kind: "owner", email: "me@example.com" });
  });

  it("a wrong password or email says the same thing and sets no cookie", async () => {
    for (const f of [{ email: "me@example.com", password: "wrong password!" }, { email: "you@example.com", password: "correct horse battery" }]) {
      const res = await post(password, "/login/password", f);
      expect(where(res)).toBe(`/login?error=bad_credentials&email=${encodeURIComponent(f.email)}`);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("throttles an IP after five failures, even for the right password; another IP still gets in", async () => {
    for (let i = 0; i < 5; i++) await post(password, "/login/password", { email: "me@example.com", password: "wrong password!" });
    const res = await post(password, "/login/password", { email: "me@example.com", password: "correct horse battery" });
    expect(where(res)).toMatch(/error=throttled/);
    expect(res.headers.get("set-cookie")).toBeNull();
    const owner = await post(password, "/login/password", { email: "me@example.com", password: "correct horse battery" }, { origin: "https://pulse.example.com", host: "pulse.example.com", "cf-connecting-ip": "203.0.113.7" });
    expect(where(owner)).toBe("/");
  });

  it("refuses a cross-site post, an oversized body, and a demo instance", async () => {
    expect((await post(password, "/login/password", { email: "me@example.com", password: "correct horse battery" }, { origin: "https://evil.example", host: "pulse.example.com" })).status).toBe(403);
    expect((await post(password, "/login/password", { email: "me@example.com", password: "x".repeat(9000) })).status).toBe(413);
    h.cfg = parseConfig({ TZ: "UTC" });
    expect((await post(password, "/login/password", { email: "me@example.com", password: "correct horse battery" })).status).toBe(404);
  });
});
