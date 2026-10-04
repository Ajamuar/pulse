// A scripted model for tests and e2e (COACH_MOCK=1, never in production): the first step calls get_day, the next
// answers in text. Deterministic, so the e2e can assert on the tool card and the reply.
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

export const MOCK_REPLY = "Your recovery is shown above. **Take it easy** if it is low, and aim for your usual bedtime.";

export function mockModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: "ok" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
    doStream: async ({ prompt }) => {
      const text = [
        { type: "text-start" as const, id: "t1" },
        ...MOCK_REPLY.split(/(?<= )/).map((delta) => ({ type: "text-delta" as const, id: "t1", delta })),
        { type: "text-end" as const, id: "t1" },
        { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
      ];
      const call = [
        { type: "tool-call" as const, toolCallId: `call-${prompt.length}`, toolName: "get_day", input: "{}" },
        { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage },
      ];
      const chunks: ((typeof text)[number] | (typeof call)[number])[] = prompt.at(-1)?.role === "tool" ? text : call;
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 20 }) };
    },
  });
}
