// The Android home-screen widget reads this. The shell sends the WebView's session cookie; the page never
// gets a native plugin. Numbers are today's Home dials, or null when a score is missing.
import { requestUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { ctxOf } from "@/server/queries/common";
import { getWidget } from "@/server/queries/widget";

export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  const ctx = await ctxOf(getDb(), user.userId).catch((e: unknown) => {
    if (e instanceof Error && e.message === "profile_missing") return null;
    throw e;
  });
  if (!ctx) return Response.json({ error: "no_profile" }, { status: 409 });
  return Response.json(await getWidget(ctx), { headers: { "Cache-Control": "private, no-store" } });
}
