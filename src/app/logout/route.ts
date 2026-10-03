import { NextResponse } from "next/server";
import { sameOrigin, SESSION_COOKIE } from "@/server/session";

/**
 * Sign out: drops the session cookie. The Google grant stays, so sync keeps running. The redirect is relative:
 * behind a tunnel request.url is the container's own address (http://0.0.0.0:3000), not the host the browser used.
 */
export function POST(request: Request) {
  // A cross-site page can't sign you out behind your back.
  if (!sameOrigin(request)) return new Response("Cross-site request refused", { status: 403 });
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
