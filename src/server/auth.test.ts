// better-auth on Postgres (PGlite): sign-up, sign-in by email and by username, the failures, and delete account
// taking every row of the user's data with it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";
import { parseConfig, type Config } from "./config";
import { type Db, rows, sql } from "./db";
import { profile } from "./db/schema";
import { seedPull } from "./sources/seed/generate";
import { freshDb, NOW, TZ, USER } from "./testing";

// Sign-up is closed on a demo instance, so these run as a Google instance.
const h = vi.hoisted(() => ({ cfg: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("./config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
const googleCfg = parseConfig({ GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs" });

const ADA = { name: "Ada Lovelace", email: "ada@example.com", password: "analytical-engine", username: "ada.l" };

/** The APIError code a call fails with, or "ok". */
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { body?: { code?: string } }) => e.body?.code ?? String(e),
  );

/** Signs in and returns request headers carrying the session cookie. */
async function signedIn(email: string, password: string) {
  const res = await getAuth().api.signInEmail({ body: { email, password }, asResponse: true });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

let db: Db;
beforeEach(async () => {
  h.cfg = googleCfg;
  db = await freshDb();
});

describe("better-auth", () => {
  it("signs up, then signs in with the email or the username", async () => {
    const up = await getAuth().api.signUpEmail({ body: ADA });
    expect(up.user).toMatchObject({ email: ADA.email, name: ADA.name, username: "ada.l" });
    expect(Number(up.user.id)).toBeGreaterThan(USER);

    const byEmail = await getAuth().api.signInEmail({ body: { email: ADA.email, password: ADA.password } });
    expect(byEmail.user.email).toBe(ADA.email);
    const byName = await getAuth().api.signInUsername({ body: { username: "ada.l", password: ADA.password } });
    expect(byName?.user.email).toBe(ADA.email);
  });

  it("refuses a wrong password, an unknown account, and sign-up with a taken username or email", async () => {
    await getAuth().api.signUpEmail({ body: ADA });
    expect(await codeOf(getAuth().api.signInEmail({ body: { email: ADA.email, password: "wrong-password" } }))).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(await codeOf(getAuth().api.signInUsername({ body: { username: "ada.l", password: "wrong-password" } }))).toBe("INVALID_USERNAME_OR_PASSWORD");
    expect(await codeOf(getAuth().api.signInEmail({ body: { email: "nobody@example.com", password: ADA.password } }))).toBe("INVALID_EMAIL_OR_PASSWORD");

    expect(await codeOf(getAuth().api.signUpEmail({ body: { ...ADA, email: "other@example.com" } }))).toBe("USERNAME_IS_ALREADY_TAKEN");
    expect(await codeOf(getAuth().api.signUpEmail({ body: { ...ADA, username: "ada.other" } }))).toMatch(/^USER_ALREADY_EXISTS/);
    expect(await codeOf(getAuth().api.signUpEmail({ body: { ...ADA, email: "short@example.com", username: "shorty", password: "too-short" } }))).toBe(
      "PASSWORD_TOO_SHORT",
    );
  });

  it("stores usernames in lowercase, signs in case-insensitively, and refuses invalid ones", async () => {
    const up = await getAuth().api.signUpEmail({ body: { ...ADA, username: "Ada.L" } });
    expect(up.user).toMatchObject({ username: "ada.l" });
    expect((await getAuth().api.signInUsername({ body: { username: "ADA.L", password: ADA.password } }))?.user.email).toBe(ADA.email);
    // Taken regardless of case.
    expect(await codeOf(getAuth().api.signUpEmail({ body: { ...ADA, email: "b@example.com", username: "ADA.l" } }))).toBe("USERNAME_IS_ALREADY_TAKEN");
    for (const username of ["ab", "has space", "dash-ed", "x".repeat(31)]) {
      expect(await codeOf(getAuth().api.signUpEmail({ body: { ...ADA, email: `${username.length}@example.com`, username } })), username).not.toBe("ok");
    }
  });

  it("delete account removes the user and every row of their data, and nobody else's", async () => {
    const id = Number((await getAuth().api.signUpEmail({ body: ADA })).user.id);
    await seedPull(db, { userId: id, now: NOW, timeZone: TZ, maxHr: 183 });
    await db.insert(profile).values({ userId: id, birthDate: "1990-01-01", sex: "female", timeZone: TZ, updatedAt: 0 });
    await db.insert(profile).values({ userId: USER, birthDate: "1990-01-01", sex: "male", timeZone: TZ, updatedAt: 0 });

    const tables = (
      await rows<{ table_name: string }>(db, sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by 1`)
    ).map((r) => r.table_name);
    const counts = async (userId: number) => {
      const out: Record<string, number> = {};
      for (const t of tables) out[t] = (await rows<{ n: number }>(db, sql`select count(*)::int as n from ${sql.identifier(t)} where user_id = ${userId}`))[0].n;
      return out;
    };
    const before = await counts(id);
    // The seed, the sign-up and the default journal tags reached a good spread of tables.
    expect(Object.values(before).filter((n) => n > 0).length).toBeGreaterThanOrEqual(5);
    for (const t of ["session", "account", "profile", "journal_tags"]) expect(before[t], t).toBeGreaterThan(0);

    const headers = await signedIn(ADA.email, ADA.password);
    expect(await codeOf(getAuth().api.deleteUser({ body: { password: "wrong-password" }, headers }))).toBe("INVALID_PASSWORD");
    await getAuth().api.deleteUser({ body: { password: ADA.password }, headers });

    expect(Object.entries(await counts(id)).filter(([, n]) => n > 0)).toEqual([]);
    expect(await rows(db, sql`select id from "user" where id = ${id}`)).toEqual([]);
    expect((await counts(USER)).profile).toBe(1);
    expect(await codeOf(getAuth().api.signInEmail({ body: { email: ADA.email, password: ADA.password } }))).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("sign-up is closed on a demo instance and with DISABLE_SIGNUP", async () => {
    for (const cfg of [parseConfig({}), parseConfig({ GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", DISABLE_SIGNUP: "true" })]) {
      h.cfg = cfg;
      db = await freshDb(); // a new auth instance reads the config
      expect(await codeOf(getAuth().api.signUpEmail({ body: ADA }))).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
    }
  });
});
