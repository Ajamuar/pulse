import type { NextRequest } from "next/server";
import { requestSession } from "@/server/auth";
import { getShellStatus } from "@/server/queries/settings";

/**
 * The shell status as JSON, polled by ShellStatusProvider while a sync or import runs so the sync ring and import
 * progress move without a reload. Behind the sign-in proxy; the handler checks the session again itself.
 */
export async function GET(req: NextRequest) {
  if (!(await requestSession(req))) return Response.json({ error: "signed_out" }, { status: 401 });
  return Response.json(getShellStatus(), { headers: { "cache-control": "no-store" } });
}
