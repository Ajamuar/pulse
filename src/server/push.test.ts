import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { buildSeeded, NOW, PROFILE, USER } from "./testing";
import { saveProfile } from "./profile";
import { pushSubscriptions } from "./db/schema";
import { notifyRecovery, notifySyncProblem, saveSubscription } from "./push";

vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("./config", () => ({ getConfig: () => ({ vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.c" } }) }));
const send = vi.mocked(webpush.sendNotification);
const sub = (n: number) => ({ endpoint: `https://push.test/${n}`, keys: { p256dh: "k", auth: "a" } });

// Braces: a returned mock would run as beforeEach's cleanup callback.
beforeEach(() => {
  send.mockReset().mockResolvedValue({} as never);
});

describe("push", () => {
  it("sends Recovery ready once per local day", async () => {
    const db = await buildSeeded();
    await saveProfile(db, USER, { ...PROFILE, maxHr: null, heightCm: null });
    await saveSubscription(db, USER, sub(1));
    await notifyRecovery(db, USER, NOW);
    await notifyRecovery(db, USER, NOW);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1] as string)).toMatchObject({ title: "Recovery ready", url: "/recovery", tag: "recovery" });
    await notifyRecovery(db, USER, NOW + 86_400); // tomorrow has no score yet: nothing
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends the sync alert once per day, to the settings page", async () => {
    const db = await buildSeeded([NOW], { compute: false });
    await saveSubscription(db, USER, sub(1));
    await notifySyncProblem(db, USER, NOW);
    await notifySyncProblem(db, USER, NOW);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1] as string)).toMatchObject({ url: "/settings", tag: "sync" });
    await notifySyncProblem(db, USER, NOW + 86_400);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("drops a subscription the push service reports gone (410), keeps one that merely failed", async () => {
    const db = await buildSeeded([NOW], { compute: false });
    await saveSubscription(db, USER, sub(1));
    await saveSubscription(db, USER, sub(2));
    send.mockImplementation(async (s) => {
      throw Object.assign(new Error("x"), { statusCode: s.endpoint.endsWith("/1") ? 410 : 500 });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await notifySyncProblem(db, USER, NOW);
    expect((await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, USER))).map((r) => r.endpoint)).toEqual(["https://push.test/2"]);
  });

  it("an endpoint moves to the latest user who subscribes with it", async () => {
    const db = await buildSeeded([NOW], { compute: false });
    await saveSubscription(db, USER, sub(1));
    await saveSubscription(db, USER, sub(1));
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  });
});
