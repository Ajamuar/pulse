import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

/**
 * Sign out: drops the session cookie. The Google grant stays, so sync keeps running. The redirect is relative:
 * behind a tunnel request.url is the container's own address (http://0.0.0.0:3000), not the host the browser used.
 */
export function POST() {
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
