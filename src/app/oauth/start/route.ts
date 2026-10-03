import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { appOrigin, authUrl, createState, hasGrant, missingScopes, redirectUri } from "@/server/sources/google/oauth";

/** Sign in with Google: redirects to consent. 404 on a demo instance (`google` is null unless GOOGLE_OAUTH_ENABLED=true). */
export function GET(request: Request) {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });
  const db = getDb();
  const url = authUrl({
    clientId: google.clientId,
    redirectUri: redirectUri(appOrigin(request, google.appUrl)),
    state: createState(),
    // A grant missing a scope Pulse now asks for (the 2026-10 write scopes) goes through consent again: only
    // that returns a refresh token for the new scope set, and the scope list stored with it.
    prompt: hasGrant(db) && !missingScopes(db).length ? "select_account" : "consent",
  });
  return Response.redirect(url, 302);
}
