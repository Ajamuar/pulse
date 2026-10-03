import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { instance } from "./db/schema";
import { saveAccount } from "./account";
import { isHttps, signSession, verifySession } from "./session";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const google = () => ({ googleEnabled: true });
const demo = { googleEnabled: false };

describe("session", () => {
  it("round-trips an owner session while that account owns the instance", async () => {
    await saveAccount(db, "Me@Example.com", "correct horse battery");
    const t = await signSession(db, { kind: "owner", email: "me@example.com" });
    expect(await verifySession(db, t, google())).toEqual({ kind: "owner", email: "me@example.com" });
  });

  it("refuses missing, forged and expired tokens", async () => {
    await saveAccount(db, "me@example.com", "correct horse battery");
    const t = await signSession(db, { kind: "owner", email: "me@example.com" });
    expect(await verifySession(db, undefined, google())).toBeNull();
    expect(await verifySession(db, t.slice(0, -2) + "xx", google())).toBeNull();
    // Signed by another instance's secret.
    const other = openDb(":memory:");
    await saveAccount(other, "me@example.com", "correct horse battery");
    expect(await verifySession(db, await signSession(other, { kind: "owner", email: "me@example.com" }), google())).toBeNull();
    expect(await verifySession(db, t, { ...google(), now: Date.now() + 91 * 86_400_000 })).toBeNull();
  });

  it("a demo session only counts on a demo instance, an owner session only for the current account", async () => {
    const d = await signSession(db, { kind: "demo" });
    expect(await verifySession(db, d, demo)).toEqual({ kind: "demo" });
    expect(await verifySession(db, d, google())).toBeNull();
    const o = await signSession(db, { kind: "owner", email: "me@example.com" });
    expect(await verifySession(db, o, google())).toBeNull(); // no account yet
    await saveAccount(db, "boss@example.com", "correct horse battery");
    expect(await verifySession(db, await signSession(db, { kind: "owner", email: "me@example.com" }), google())).toBeNull();
    expect(await verifySession(db, await signSession(db, { kind: "owner", email: "boss@example.com" }), demo)).toBeNull();
  });

  it("saving the password again signs every earlier session out", async () => {
    await saveAccount(db, "me@example.com", "correct horse battery");
    const before = await signSession(db, { kind: "owner", email: "me@example.com" });
    await saveAccount(db, "me@example.com", "another long password");
    expect(await verifySession(db, before, google())).toBeNull();
    expect(await verifySession(db, await signSession(db, { kind: "owner", email: "me@example.com" }), google())).not.toBeNull();
  });

  it("the secret is generated once and kept", async () => {
    await signSession(db, { kind: "demo" });
    const s = db.select().from(instance).get()!.sessionSecret;
    expect(s).toMatch(/^[\w-]{43}$/);
    await signSession(db, { kind: "demo" });
    expect(db.select().from(instance).get()!.sessionSecret).toBe(s);
  });
});

it("isHttps reads the forwarded protocol first", () => {
  expect(isHttps(new Request("http://x/"))).toBe(false);
  expect(isHttps(new Request("https://x/"))).toBe(true);
  expect(isHttps(new Request("http://x/", { headers: { "x-forwarded-proto": "https" } }))).toBe(true);
});
