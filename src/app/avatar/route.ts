import type { NextRequest } from "next/server";
import { requestSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { uploadedAvatar } from "@/server/avatar";

/**
 * The uploaded avatar. Behind the sign-in proxy like every page; the handler checks the session again itself.
 * `?v=` busts the cache on a new upload.
 */
export async function GET(req: NextRequest) {
  if (!(await requestSession(req))) return new Response("Signed out", { status: 401 });
  const a = uploadedAvatar(getDb());
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.bytes), {
    headers: { "content-type": a.type, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
