import { NextResponse } from "next/server";
import { accountOf, beginAttempt, clientIp, normalizeEmail, readSmallForm, recordSuccess, verifyPassword } from "@/server/account";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { cookieOptions, isHttps, sameOrigin, SESSION_COOKIE, signSession } from "@/server/session";

/** Relative, like /logout: request.url is the container's address behind a tunnel. */
const go = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

/** Sign in with the Pulse account's email and password (a plain form post from /login). 404 on a demo instance. */
export async function POST(request: Request) {
  if (!getConfig().google) return new Response("Not found", { status: 404 });
  if (!sameOrigin(request)) return new Response("Cross-site request refused", { status: 403 });
  // Two fields and a code: anything bigger is not this form.
  const form = await readSmallForm(request);
  if (!form) return new Response("Too large", { status: 413 });
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const back = (error: string) => go(`/login?${new URLSearchParams({ error, email })}`);
  const db = getDb();
  const account = accountOf(db);
  if (!account) return go("/setup");
  const ip = clientIp(request.headers);
  if (!beginAttempt("password", ip)) return back("throttled");
  // The hash runs even for a wrong email, so the answer takes as long either way.
  const ok = (await verifyPassword(password, account.passwordHash)) && email === account.email;
  if (!ok) return back("bad_credentials");
  recordSuccess("password", ip);
  const res = go("/");
  res.cookies.set(SESSION_COOKIE, await signSession(db, { kind: "owner", email: account.email }), cookieOptions(isHttps(request)));
  return res;
}
