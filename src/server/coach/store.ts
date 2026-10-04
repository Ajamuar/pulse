// The coach's stored state: who may use it (admin panel), each user's provider, key and consent, and their chats.
// Every per-user read and write filters on user_id. The API key is encrypted (crypto.ts) and never leaves the server.
import { and, desc, eq } from "drizzle-orm";
import type { LanguageModel, UIMessage } from "ai";
import { isOwnerEmail } from "../admin";
import { getConfig } from "../config";
import type { Db } from "../db";
import { coachChats, coachSettings, serverSettings, user } from "../db/schema";
import { decryptKey, encryptKey } from "./crypto";
import { mockModel } from "./mock";
import { localModel, providerOf } from "./providers";

const now = () => Math.floor(Date.now() / 1000);

// ── Access (admin panel) ─────────────────────────────────────────────────────

export const COACH_MODES = ["off", "everyone", "chosen"] as const;
export type CoachMode = (typeof COACH_MODES)[number];

export async function coachMode(db: Db): Promise<CoachMode> {
  const [r] = await db.select({ value: serverSettings.value }).from(serverSettings).where(eq(serverSettings.key, "coach"));
  return COACH_MODES.find((m) => m === r?.value) ?? "off";
}

export async function setCoachMode(db: Db, mode: CoachMode): Promise<void> {
  await db.insert(serverSettings).values({ key: "coach", value: mode }).onConflictDoUpdate({ target: serverSettings.key, set: { value: mode } });
}

/** Whether this user may use the coach: a Google instance, the mode not off, and (when chosen) picked or an owner. */
export async function coachAccess(db: Db, userId: number): Promise<boolean> {
  if (getConfig().dataSource !== "google") return false;
  const mode = await coachMode(db);
  if (mode === "off") return false;
  if (mode === "everyone") return true;
  const [u] = await db.select({ allowed: user.coachAllowed, email: user.email }).from(user).where(eq(user.id, userId));
  return !!u && (u.allowed || isOwnerEmail(u.email));
}

export async function setCoachAllowed(db: Db, userId: number, allowed: boolean): Promise<void> {
  await db.update(user).set({ coachAllowed: allowed }).where(eq(user.id, userId));
}

// ── Provider, key and consent ────────────────────────────────────────────────

/** What the browser may know about the user's setup: never the key itself. */
export type CoachSetup = { provider: string | null; model: string | null; last4: string | null; consent: boolean };

export async function coachSetup(db: Db, userId: number): Promise<CoachSetup> {
  const [r] = await db.select().from(coachSettings).where(eq(coachSettings.userId, userId));
  return { provider: r?.provider ?? null, model: r?.model ?? null, last4: r?.keyLast4 ?? null, consent: r?.consentAt != null };
}

export async function setConsent(db: Db, userId: number, on: boolean): Promise<void> {
  const consentAt = on ? now() : null;
  await db
    .insert(coachSettings)
    .values({ userId, consentAt, updatedAt: now() })
    .onConflictDoUpdate({ target: coachSettings.userId, set: { consentAt, updatedAt: now() } });
}

/** Stores the provider and model, and the key encrypted (null for the owner's local model, which needs none). */
export async function saveProvider(db: Db, userId: number, provider: string, model: string, apiKey: string | null): Promise<void> {
  const secret = getConfig().authSecret;
  if (apiKey !== null && !secret) throw new Error("no_secret");
  const values = {
    provider,
    model,
    keyCiphertext: apiKey === null ? null : encryptKey(apiKey, secret!),
    keyLast4: apiKey === null ? null : apiKey.slice(-4),
    updatedAt: now(),
  };
  await db.insert(coachSettings).values({ userId, ...values }).onConflictDoUpdate({ target: coachSettings.userId, set: values });
}

export async function removeProvider(db: Db, userId: number): Promise<void> {
  await db.update(coachSettings).set({ provider: null, model: null, keyCiphertext: null, keyLast4: null, updatedAt: now() }).where(eq(coachSettings.userId, userId));
}

export type ModelProblem = "no_access" | "no_consent" | "no_key" | "key_unreadable";

/** The model to answer with: the user's provider and key, the owner's local model, or the mock in e2e. */
export function modelFor(provider: string, model: string, apiKey: string | null): LanguageModel | null {
  const cfg = getConfig();
  if (provider === "local") return cfg.coachLocal ? localModel(cfg.coachLocal.url, cfg.coachLocal.model) : null;
  if (provider === "mock") return cfg.coachMock ? mockModel() : null;
  const p = providerOf(provider);
  return p && apiKey ? p.create(apiKey, model) : null;
}

export async function coachModel(db: Db, userId: number): Promise<{ model: LanguageModel; provider: string } | { problem: ModelProblem }> {
  if (!(await coachAccess(db, userId))) return { problem: "no_access" };
  const [r] = await db.select().from(coachSettings).where(eq(coachSettings.userId, userId));
  if (!r?.consentAt) return { problem: "no_consent" };
  if (!r.provider || !r.model) return { problem: "no_key" };
  let key: string | null = null;
  if (r.keyCiphertext) {
    const secret = getConfig().authSecret;
    key = secret ? decryptKey(r.keyCiphertext, secret) : null;
    if (key === null) return { problem: "key_unreadable" };
  }
  const model = modelFor(r.provider, r.model, key);
  return model ? { model, provider: r.provider } : { problem: "no_key" };
}

// ── Chats ────────────────────────────────────────────────────────────────────

export type ChatRow = { id: string; title: string; updatedAt: number };

export async function listChats(db: Db, userId: number): Promise<ChatRow[]> {
  return db
    .select({ id: coachChats.id, title: coachChats.title, updatedAt: coachChats.updatedAt })
    .from(coachChats)
    .where(eq(coachChats.userId, userId))
    .orderBy(desc(coachChats.updatedAt))
    .limit(50);
}

export async function loadChat(db: Db, userId: number, id: string): Promise<UIMessage[] | null> {
  const [r] = await db.select({ messages: coachChats.messages }).from(coachChats).where(and(eq(coachChats.userId, userId), eq(coachChats.id, id)));
  return r ? (r.messages as UIMessage[]) : null;
}

/** The first thing the user asked, cut to 60 characters. */
export function titleOf(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim().replace(/\s+/g, " ") ?? "";
  return (text.length > 60 ? `${text.slice(0, 59)}…` : text) || "New chat";
}

export async function saveChat(db: Db, userId: number, id: string, messages: UIMessage[]): Promise<void> {
  const at = now();
  await db
    .insert(coachChats)
    .values({ userId, id, title: titleOf(messages), messages, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({ target: [coachChats.userId, coachChats.id], set: { messages, updatedAt: at } });
}

export async function deleteChat(db: Db, userId: number, id: string): Promise<void> {
  await db.delete(coachChats).where(and(eq(coachChats.userId, userId), eq(coachChats.id, id)));
}

export async function deleteAllChats(db: Db, userId: number): Promise<void> {
  await db.delete(coachChats).where(eq(coachChats.userId, userId));
}

// ── Requests per minute ──────────────────────────────────────────────────────

// ponytail: in-memory, one Pulse process (the Docker setup); move to Postgres if Pulse ever runs several instances.
const hits = new Map<number, number[]>();
export const PER_MINUTE = 10;

/** Counts a request; false when the user already made PER_MINUTE in the last minute. */
export function allowRequest(userId: number, at = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => at - t < 60_000);
  if (recent.length >= PER_MINUTE) {
    hits.set(userId, recent);
    return false;
  }
  hits.set(userId, [...recent, at]);
  return true;
}
