// Accounts and sessions (better-auth on Postgres through the Drizzle adapter). Anyone can sign up with a name, a
// username and an email, then sign in with either the username or the email. Pages, Server Actions and route
// handlers each look the session up themselves: the proxy only checks that a session cookie exists.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { headers } from "next/headers";
import { cache } from "react";
import { getConfig } from "./config";
import { type Db, getDb } from "./db";
import * as schema from "./db/schema";
import { ensureDefaultTags } from "./journalTags";

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;
export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

function createAuth(db: Db) {
  const cfg = getConfig();
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // A demo instance holds only generated data, so a fixed secret is fine there; a real one must set its own
    // (config.ts refuses to start in production without it).
    secret: cfg.authSecret ?? (cfg.googleOAuthEnabled ? undefined : DEMO_SECRET),
    ...(cfg.appUrl && { baseURL: cfg.appUrl, trustedOrigins: [cfg.appUrl] }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD,
      maxPasswordLength: MAX_PASSWORD,
      // A demo instance has one shared demo user and no sign-up.
      disableSignUp: cfg.disableSignup || !cfg.googleOAuthEnabled,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
    },
    user: { deleteUser: { enabled: true } },
    // A new account starts with the default journal behaviours; its data rows go with it on delete (FK cascade).
    databaseHooks: { user: { create: { after: async (u) => void (await ensureDefaultTags(db, Number(u.id))) } } },
    // No cookie cache: every request checks the session row (one indexed lookup), so a sign-out, password change or
    // deleted account takes effect at once on every device.
    session: { expiresIn: 30 * 86_400, updateAge: 86_400 },
    rateLimit: {
      enabled: process.env.NODE_ENV !== "test",
      storage: "database",
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/sign-up/*": { window: 3600, max: 10 },
        "/change-password": { window: 600, max: 5 },
      },
    },
    advanced: {
      // Behind Cloudflare Tunnel, the tunnel sets the client IP and overwrites any the client sent.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
      database: { generateId: "serial" },
    },
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 30, usernameValidator: (u) => USERNAME_RE.test(u.toLowerCase()) }), // stored lowercase
      nextCookies(), // last: lets Server Actions set the session cookie
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Per database, so a test that swaps the database (setDb) gets an auth bound to it.
const g = globalThis as typeof globalThis & { __pulseAuth?: { db: Db; auth: Auth } };

export function getAuth(): Auth {
  const db = getDb();
  if (g.__pulseAuth?.db !== db) g.__pulseAuth = { db, auth: createAuth(db) };
  return g.__pulseAuth.auth;
}

export type SessionUser = { userId: number; email: string; name: string; username: string | null; image: string | null };

function toUser(s: Awaited<ReturnType<Auth["api"]["getSession"]>>): SessionUser | null {
  if (!s) return null;
  const u = s.user as typeof s.user & { username?: string | null };
  return { userId: Number(u.id), email: u.email, name: u.name, username: u.username ?? null, image: u.image ?? null };
}

/** The signed-in user for a Server Component or Server Action, or null. Once per request (layout and page share it). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  // Headers first: during `next build` this throws (the page is dynamic) before better-auth is ever created.
  const h = await headers();
  return toUser(await getAuth().api.getSession({ headers: h }));
});

/** The signed-in user for a route handler, from the request's own headers. */
export async function requestUser(req: Request): Promise<SessionUser | null> {
  return toUser(await getAuth().api.getSession({ headers: req.headers }));
}

export const SIGNED_OUT = { ok: false as const, error: "Signed out. Sign in again." };

// ── Demo instance ────────────────────────────────────────────────────────────

export const DEMO_EMAIL = "demo@pulse.local";
const DEMO_SECRET = "pulse-demo-instance-generated-data-only";
// The demo user's data is generated, so its password protects nothing; it only lets "Continue with demo data"
// sign in through the normal path.
export const DEMO_PASSWORD = "pulse-demo-generated-data";
