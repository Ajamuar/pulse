import { NextResponse, type NextRequest } from "next/server";
import { requestSession } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { connectedGoogleEmail, forgetSyncedData, setGoogleEmail, setOwnerName, setOwnerPicture } from "@/server/avatar";
import { appOrigin, consumeState, exchangeCode, GoogleError, redirectUri } from "@/server/sources/google/oauth";
import { requestSync } from "@/server/worker";

/**
 * Google's redirect back after Connect Google. A missing, unknown, reused or expired `state` is a 400 and touches
 * nothing; without a Pulse session it goes to /login. Lands on Settings with `?oauth=connected` or `?oauth=<code>`.
 */
export async function GET(request: NextRequest) {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });

  const params = request.nextUrl.searchParams;
  if (!consumeState(params.get("state"))) return new Response("Invalid or expired state", { status: 400 });

  const db = getDb();
  const origin = appOrigin(request, google.appUrl);
  if (!(await requestSession(request))) return NextResponse.redirect(`${origin}/login`, 302);
  const back = (result: string) => NextResponse.redirect(`${origin}/settings?oauth=${encodeURIComponent(result)}`, 302);
  const code = params.get("code");
  if (!code) return back("access_denied");
  try {
    const { email, picture, name } = await exchangeCode(db, { google, redirectUri: redirectUri(origin), code });
    // Another Google account than the last one (or the first one recorded): what the old one synced is cleared.
    if (connectedGoogleEmail(db) !== email) forgetSyncedData(db);
    setGoogleEmail(db, email);
    setOwnerPicture(db, picture);
    setOwnerName(db, name);
    // Start the import now, not at the next timer tick. Fire-and-forget, so the redirect doesn't wait on the sync.
    requestSync({ force: true });
    return back("connected");
  } catch (err) {
    // GoogleError messages hold a status and code only; anything else is logged by name alone.
    console.error(`[oauth] callback failed: ${err instanceof GoogleError ? err.message : (err as Error)?.name}`);
    return back(err instanceof GoogleError ? err.code : "error");
  }
}
