import { NextResponse } from "next/server";
import { z } from "zod";
import { accountOf, beginAttempt, clientIp, consumeSetupCode, MAX_PASSWORD, MIN_PASSWORD, normalizeEmail, readSmallForm, recordSuccess, saveAccount } from "@/server/account";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { cookieOptions, isHttps, sameOrigin, SESSION_COOKIE, signSession } from "@/server/session";

const go = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

/**
 * The /setup form: creates the Pulse account, or resets its password once it exists (the email stays). Both need
 * the one-time code from the server log. Signs in and lands on Home, which routes on to onboarding the first time.
 */
export async function POST(request: Request) {
  if (!getConfig().google) return new Response("Not found", { status: 404 });
  if (!sameOrigin(request)) return new Response("Cross-site request refused", { status: 403 });
  // Two fields and a code: anything bigger is not this form.
  const form = await readSmallForm(request);
  if (!form) return new Response("Too large", { status: 413 });
  const db = getDb();
  const existing = accountOf(db);
  const email = existing?.email ?? normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const back = (error: string) => go(`/setup?${new URLSearchParams({ error, ...(!existing && { email }) })}`);

  const ip = clientIp(request.headers);
  if (!existing && (!z.email().safeParse(email).success || email.length > 254)) return back("bad_email");
  if (password.length < MIN_PASSWORD) return back("short_password");
  if (password.length > MAX_PASSWORD) return back("long_password");
  if (!beginAttempt("code", ip)) return back("throttled");
  if (!consumeSetupCode(String(form.get("code") ?? ""))) return back("bad_code");
  recordSuccess("code", ip);
  await saveAccount(db, email, password);
  const res = go("/");
  res.cookies.set(SESSION_COOKIE, await signSession(db, { kind: "owner", email }), cookieOptions(isHttps(request)));
  return res;
}
