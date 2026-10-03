// The Pulse account: one email and password per instance, separate from whichever Google account feeds the data.
// Created once on /setup with a one-time code from the server log; the same code resets a forgotten password
// (a self-hosted server has no email to send a reset link with).
import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import { instance } from "./db/schema";

export const MIN_PASSWORD = 10;
/** Longer input is refused before hashing, so a megabyte "password" can't tie up the hash pool. */
export const MAX_PASSWORD = 256;
const KEY_LEN = 64;
// OWASP's scrypt option N=2^14, r=8, p=5: 16 MB a hash, so the 4 hashes libuv runs at once stay well inside the
// container's memory limit. The cost is written into each hash, so raising it later still verifies old ones.
const COST = { N: 16_384, r: 8, p: 5 };

const derive = (password: string, salt: Buffer, c: typeof COST) =>
  new Promise<Buffer>((ok, fail) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, { ...c, maxmem: 256 * c.N * c.r }, (err, key) => (err ? fail(err) : ok(key))),
  );

/** `scrypt$N$r$p$<salt>$<key>`, salt and key base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [kind, n, r, p, salt, key] = (stored ?? "").split("$");
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  const valid = kind === "scrypt" && salt && key && [cost.N, cost.r, cost.p].every((x) => Number.isInteger(x) && x > 0) && cost.N <= 2 ** 20;
  if (!valid || password.length > MAX_PASSWORD) {
    await derive("", randomBytes(16), COST); // same cost either way, so timing doesn't say why it failed
    return false;
  }
  const want = Buffer.from(key, "base64url");
  const got = await derive(password, Buffer.from(salt, "base64url"), cost);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function accountOf(db: Db): { email: string; passwordHash: string } | null {
  const row = db.select({ email: instance.ownerEmail, hash: instance.passwordHash }).from(instance).get();
  return row?.email && row.hash ? { email: row.email, passwordHash: row.hash } : null;
}

/** Sets the email and password. A new session secret signs everyone else out (every earlier cookie stops verifying). */
export async function saveAccount(db: Db, email: string, password: string) {
  const passwordHash = await hashPassword(password);
  db.insert(instance).values({ id: 1, sessionSecret: randomBytes(32).toString("base64url") }).onConflictDoNothing().run();
  db.update(instance).set({ ownerEmail: normalizeEmail(email), passwordHash, sessionSecret: randomBytes(32).toString("base64url") }).run();
}

/**
 * A small urlencoded form body, or null past `max` bytes. Reads the stream itself rather than trusting
 * Content-Length, which a chunked upload leaves out.
 */
export async function readSmallForm(req: Request, max = 8192): Promise<URLSearchParams | null> {
  if (!req.body) return new URLSearchParams();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

// ── Setup code ───────────────────────────────────────────────────────────────

const CODE_TTL_MS = 30 * 60_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const g = globalThis as typeof globalThis & { __pulseSetupCode?: { code: string; expires: number } };

/**
 * The current one-time code, issuing (and logging) a new one when none is live. Only someone who can read the
 * server's log can create the account or reset its password.
 */
export function issueSetupCode(log: Pick<Console, "info"> = console, now = Date.now()): void {
  if (g.__pulseSetupCode && g.__pulseSetupCode.expires > now) return;
  const raw = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  g.__pulseSetupCode = { code, expires: now + CODE_TTL_MS };
  log.info(`[auth] setup code: ${code} (valid 30 minutes, single use). Enter it on /setup to create the account or reset its password.`);
}

/** True once for the live code; it is used up either way only on success. Case, spaces and the dash don't matter. */
export function consumeSetupCode(input: string, now = Date.now()): boolean {
  const live = g.__pulseSetupCode;
  if (!live || live.expires <= now) return false;
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const a = Buffer.from(norm(input));
  const b = Buffer.from(norm(live.code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  g.__pulseSetupCode = undefined;
  return true;
}

// ── Throttle ─────────────────────────────────────────────────────────────────

// Failed attempts per client IP and per kind (passwords, setup codes), so one visitor spamming wrong passwords
// locks out only themselves and never blocks the owner's sign-in or the code reset. Each IP gets 5 free tries,
// then a wait that doubles per failure up to 15 minutes. A looser ceiling across all IPs (50 an hour per kind)
// caps a spread-out guesser. ponytail: in memory, so a restart clears it; persist it if that ever matters.
export type AttemptKind = "password" | "code";
const FREE_TRIES = 5;
const MAX_WAIT_MS = 15 * 60_000;
const GLOBAL_PER_HOUR = 50;
type Entry = { count: number; until: number };
type State = { ips: Map<string, Entry>; global: number[] };
const t = globalThis as typeof globalThis & { __pulseAuthFails?: Record<AttemptKind, State> };
const state = (kind: AttemptKind) => ((t.__pulseAuthFails ??= { password: { ips: new Map(), global: [] as number[] }, code: { ips: new Map(), global: [] as number[] } })[kind]);

/**
 * The client's IP: Cloudflare's `cf-connecting-ip` (the tunnel sets it and overwrites any the client sent), else
 * the first `x-forwarded-for`, else one shared bucket. A direct client can fake both headers, which is what the
 * global ceiling is for.
 */
export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0].trim() || "direct";
}

/** Milliseconds until `ip` may try `kind` again (0 = now). */
export function retryAfter(kind: AttemptKind, ip: string, now = Date.now()): number {
  const s = state(kind);
  s.global = s.global.filter((x) => x > now - 3_600_000);
  if (s.global.length >= GLOBAL_PER_HOUR) return s.global[0] + 3_600_000 - now;
  return Math.max(0, (s.ips.get(ip)?.until ?? 0) - now);
}

/**
 * Starts an attempt: counts it as a failure up front, so parallel requests can't all slip in before the first
 * slow hash finishes; `recordSuccess` takes it back. False when the caller must wait.
 */
export function beginAttempt(kind: AttemptKind, ip: string, now = Date.now()): boolean {
  if (retryAfter(kind, ip, now) > 0) return false;
  const s = state(kind);
  if (s.ips.size > 10_000) for (const [k, e] of s.ips) if (e.until < now) s.ips.delete(k); // bounded memory
  const count = (s.ips.get(ip)?.count ?? 0) + 1;
  s.ips.set(ip, { count, until: now + (count < FREE_TRIES ? 0 : Math.min(MAX_WAIT_MS, 30_000 * 2 ** (count - FREE_TRIES))) });
  s.global.push(now);
  return true;
}

/** A success clears that IP's count and takes back the attempt it began (the global log keeps only failures). */
export function recordSuccess(kind: AttemptKind, ip: string) {
  const s = state(kind);
  s.ips.delete(ip);
  s.global.pop();
}

/** Test hook. */
export function resetAuthState() {
  t.__pulseAuthFails = undefined;
  g.__pulseSetupCode = undefined;
}
