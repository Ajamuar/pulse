import type { NextRequest } from "next/server";
import { requestSession } from "@/server/auth";
import { syncErrorText } from "@/server/queries/settings";
import { syncAndWait } from "@/server/worker";

/**
 * "Sync now": runs a sync past the worker's 5-minute gate and answers when it lands. A route, not a Server Action:
 * Next.js holds every navigation until a pending action returns, so a 20-second sync froze every link. Cross-site
 * POSTs carry no session (the cookie is SameSite=Lax), so they get the 401.
 */
export async function POST(req: NextRequest) {
  if (!(await requestSession(req))) return Response.json({ ok: false, error: "Signed out. Sign in again." }, { status: 401 });
  const r = await syncAndWait();
  return Response.json(r.ok ? { ok: true } : { ok: false, error: r.error ? syncErrorText(r.error) : "Sync failed" }, { headers: { "cache-control": "no-store" } });
}
