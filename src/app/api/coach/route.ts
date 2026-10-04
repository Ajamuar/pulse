// The coach's chat endpoint (useChat on /coach). Order: signed in, coach access, a usable model (consent and key),
// requests per minute, then the chat itself, loaded and saved by id **and** the user. Never logs message content,
// tool output, keys or provider bodies.
import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { requestUser } from "@/server/auth";
import { coachInstructions } from "@/server/coach/instructions";
import { allowRequest, coachModel, loadChat, saveChat } from "@/server/coach/store";
import { coachTools } from "@/server/coach/tools";
import { getDb } from "@/server/db";
import { ctxOf } from "@/server/queries/common";

/** History sent to the model: the newest messages only (the whole chat is still saved). */
const HISTORY = 20;

const Body = z.object({
  id: z.string().regex(/^[\w-]{8,64}$/),
  message: z.object({ id: z.string(), role: z.literal("user"), parts: z.array(z.unknown()).min(1).max(20) }).passthrough(),
});

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return fail(401, "signed_out");
  const db = getDb();
  const m = await coachModel(db, user.userId);
  if ("problem" in m) return m.problem === "no_access" ? fail(404, "not_found") : fail(409, "key");
  if (!allowRequest(user.userId)) return fail(429, "limit");

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "bad_request");
  const { id } = body.data;
  const ctx = await ctxOf(db, user.userId).catch(() => null);
  if (!ctx) return fail(409, "profile");

  const tools = coachTools(ctx);
  const previous = (await loadChat(db, user.userId, id)) ?? [];
  const messages = await validateUIMessages({ messages: [...previous, body.data.message as UIMessage], tools }).catch(() => null);
  if (!messages) return fail(400, "bad_request");

  const started = Date.now();
  const result = streamText({
    model: m.model,
    instructions: coachInstructions(ctx),
    messages: await convertToModelMessages(messages.slice(-HISTORY)),
    tools,
    stopWhen: isStepCount(6),
    abortSignal: req.signal,
  });
  result.consumeStream(); // finish and save even if the browser goes away

  return createUIMessageStreamResponse({
    headers: { "X-Accel-Buffering": "no" }, // stream through nginx-style proxies
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: () => crypto.randomUUID(),
      onEnd: async ({ messages: all }) => {
        await saveChat(db, user.userId, id, all);
        console.info(`[coach] user ${user.userId} via ${m.provider}: ${Date.now() - started} ms`);
      },
      onError: (e) => {
        // Status and name only: provider errors can echo the request.
        console.warn(`[coach] ${m.provider} failed: ${e instanceof Error ? e.name : "error"}`);
        return "provider";
      },
    }),
  });
}
