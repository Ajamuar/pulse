// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn();
vi.mock("@/server/actions/journal", () => ({ saveJournalEntry: (...a: unknown[]) => save(...a) }));
const { enqueue, flushQueue, queued } = await import("./offline-queue");

beforeEach(() => {
  localStorage.clear();
  save.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

describe("offline check-in queue", () => {
  it("keeps the newest answer per (day, tag)", () => {
    enqueue([{ day: "2026-10-01", tag: "alcohol", value: true }]);
    enqueue([{ day: "2026-10-01", tag: "alcohol", value: false }, { day: "2026-10-01", tag: "caffeine", value: true }]);
    expect(queued()).toBe(2);
  });

  it("sends everything and empties; a server rejection is dropped, not retried", async () => {
    enqueue([{ day: "2026-10-01", tag: "a", value: true }, { day: "2026-10-01", tag: "b", value: null }]);
    save.mockResolvedValueOnce({ ok: true, data: undefined }).mockResolvedValueOnce({ ok: false, error: "Unknown tag: b" });
    expect(await flushQueue()).toBe(1);
    expect(queued()).toBe(0);
  });

  it("a network failure or a signed-out session keeps the rest", async () => {
    enqueue([{ day: "2026-10-01", tag: "a", value: true }, { day: "2026-10-01", tag: "b", value: true }]);
    save.mockRejectedValueOnce(new Error("network"));
    expect(await flushQueue()).toBe(0);
    expect(queued()).toBe(2);
    save.mockResolvedValueOnce({ ok: false, error: "Signed out. Sign in again." });
    await flushQueue();
    expect(queued()).toBe(2);
  });

  it("does nothing while offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    enqueue([{ day: "2026-10-01", tag: "a", value: true }]);
    expect(await flushQueue()).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });
});
