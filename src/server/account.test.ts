// The Pulse account: password hashing, the one-time setup code and the failure throttle.
import { beforeEach, describe, expect, it } from "vitest";
import { accountOf, beginAttempt, clientIp, consumeSetupCode, hashPassword, issueSetupCode, recordSuccess, resetAuthState, retryAfter, saveAccount, verifyPassword } from "./account";
import { openDb } from "./db";

beforeEach(resetAuthState);

describe("passwords", () => {
  it("verifies the right password only, with a fresh salt per hash", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt\$16384\$8\$5\$[\w-]+\$[\w-]+$/);
    expect(h).not.toBe(await hashPassword("correct horse battery"));
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("an account exists only with both an email and a password", async () => {
    const db = openDb(":memory:");
    expect(accountOf(db)).toBeNull();
    await saveAccount(db, "  Me@Example.com ", "correct horse battery");
    expect(accountOf(db)?.email).toBe("me@example.com");
  });
});

describe("setup code", () => {
  it("is logged once, accepted once, in any case and spacing, and expires", () => {
    const lines: string[] = [];
    issueSetupCode({ info: (l: string) => lines.push(l) }, 0);
    issueSetupCode({ info: (l: string) => lines.push(l) }, 1000); // still live: not reissued
    expect(lines).toHaveLength(1);
    const code = lines[0].match(/[A-Z2-9]{4}-[A-Z2-9]{4}/)![0];
    expect(consumeSetupCode("WRONG-CODE", 1000)).toBe(false);
    expect(consumeSetupCode(` ${code.toLowerCase().replace("-", "")} `, 1000)).toBe(true);
    expect(consumeSetupCode(code, 1000)).toBe(false);
    issueSetupCode({ info: (l: string) => lines.push(l) }, 0);
    const next = lines[1].match(/[A-Z2-9]{4}-[A-Z2-9]{4}/)![0];
    expect(consumeSetupCode(next, 31 * 60_000)).toBe(false);
  });
});

describe("throttle", () => {
  it("allows five failures per IP, then waits longer each time; a success clears that IP", () => {
    for (let i = 0; i < 5; i++) expect(beginAttempt("password", "1.1.1.1", 0)).toBe(true);
    expect(retryAfter("password", "1.1.1.1", 0)).toBe(30_000);
    expect(beginAttempt("password", "1.1.1.1", 0)).toBe(false);
    expect(beginAttempt("password", "1.1.1.1", 30_000)).toBe(true);
    expect(retryAfter("password", "1.1.1.1", 30_000)).toBe(60_000);
    recordSuccess("password", "1.1.1.1");
    expect(retryAfter("password", "1.1.1.1", 30_000)).toBe(0);
  });

  it("one IP's failures never block another IP, or the setup code", () => {
    for (let i = 0; i < 10; i++) beginAttempt("password", "6.6.6.6", 0);
    expect(beginAttempt("password", "2.2.2.2", 0)).toBe(true);
    expect(beginAttempt("code", "6.6.6.6", 0)).toBe(true);
  });

  it("a spread-out guesser hits the global ceiling of 50 an hour", () => {
    for (let i = 0; i < 50; i++) beginAttempt("password", `10.0.0.${i}`, 0);
    expect(beginAttempt("password", "10.0.1.1", 0)).toBe(false);
    expect(beginAttempt("password", "10.0.1.1", 3_600_001)).toBe(true);
  });

  it("reads Cloudflare's client IP first", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("direct");
  });
});
