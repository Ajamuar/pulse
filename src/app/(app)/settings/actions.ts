"use server";
// Settings actions. Disconnect Google (spec §7.14): revoke every permission at Google and forget the grant; stored
// health data stays on this server. Change password.
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { accountOf, beginAttempt, clientIp, MAX_PASSWORD, MIN_PASSWORD, recordSuccess, saveAccount, verifyPassword } from "@/server/account";
import { currentSession, SIGNED_OUT } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/server/session";
import { revokeGrant } from "@/server/sources/google/oauth";
import type { ActionResult } from "@/server/actions/journal";

export async function disconnectGoogle(): Promise<ActionResult> {
  if ((await currentSession())?.kind !== "owner") return SIGNED_OUT;
  if (!getConfig().google) return { ok: false, error: "Google is not enabled" };
  const db = getDb();
  try {
    await revokeGrant(db);
  } catch {
    return { ok: false, error: "Couldn’t reach Google to remove access. Try again." };
  }
  // The old grant's sync errors (revoked, not linked) no longer describe anything.
  db.$client.prepare("update sync_state set last_error = null").run();
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/**
 * Settings › Account › Change password: needs the current one. Saving rotates the session secret, which signs out
 * every other device; this one gets a fresh cookie.
 */
export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const session = await currentSession();
  if (session?.kind !== "owner") return SIGNED_OUT;
  if (typeof current !== "string" || typeof next !== "string") return { ok: false, error: "Enter both passwords." };
  if (next.length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  if (next.length > MAX_PASSWORD) return { ok: false, error: `Use at most ${MAX_PASSWORD} characters.` };
  const h = await headers();
  const ip = clientIp(h);
  if (!beginAttempt("password", ip)) return { ok: false, error: "Too many tries. Wait a few minutes, then try again." };
  const db = getDb();
  if (!(await verifyPassword(current, accountOf(db)?.passwordHash ?? null))) return { ok: false, error: "Current password is incorrect." };
  recordSuccess("password", ip);
  await saveAccount(db, session.email, next);
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  (await cookies()).set(SESSION_COOKIE, await signSession(db, { kind: "owner", email: session.email }), cookieOptions(proto === "https"));
  return { ok: true, data: undefined };
}
