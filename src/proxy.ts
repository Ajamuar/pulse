import { NextResponse, type NextRequest } from "next/server";
import { accountOf } from "@/server/account";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { getProfile } from "@/server/profile";
import { SESSION_COOKIE, verifySession } from "@/server/session";

/**
 * The sign-in gate. Signed out: everything goes to /login, or to /setup on a real instance that has no account
 * yet. Signed in without a profile: everything goes to /onboarding (U19). Route handlers and server actions check
 * the session again themselves.
 */
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const { google } = getConfig();
  const db = getDb();
  const session = await verifySession(db, req.cookies.get(SESSION_COOKIE)?.value, { googleEnabled: !!google });
  const to = (p: string) => NextResponse.redirect(new URL(p, req.url));
  const signedOutPage = path === "/login" || path.startsWith("/login/") || path === "/setup";
  if (!session) {
    if (signedOutPage) return undefined;
    return to(google && !accountOf(db) ? "/setup" : "/login");
  }
  if (signedOutPage) return to("/");
  const onboarded = getProfile(db) !== null;
  if (!onboarded && path !== "/onboarding") return to("/onboarding");
  if (onboarded && path === "/onboarding") return to("/");
}

export const config = {
  // Open to all: Google's redirect, the health check, build assets, and files under public/ (static extensions only,
  // so a page path with a dot in it, /activity/a.b, is still gated).
  matcher: ["/((?!oauth/|healthz|_next/|.*\\.(?:ico|png|jpe?g|svg|webp|webmanifest|txt|xml|js|css|woff2?|map)$).*)"],
};
