// Logging from Pulse (spec §11 LG1): what the owner logs is written to Google Health and mirrored in
// `logged_entries`, the only copy Pulse can read of the write-only types. Demo mode keeps it local.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describeEntry, LOG_TYPES, READABLE, scopeUrl, type LogType } from "@/lib/log";
import type { Db } from "./db";
import { loggedEntries, oauthTokens } from "./db/schema";
import type { GoogleClient } from "./sources/google/client";
import { GoogleError } from "./sources/google/oauth";
import { toDataPoint } from "./sources/google/write";
import { localDay } from "./time";

/** `demo`: kept in Pulse only. `reconnect`: the grant lacks this type's write scope (or was revoked). */
export type LogAccess = "demo" | "ok" | "reconnect" | "not_connected";

export function logAccess(db: Db, mode: "demo" | "google"): Record<LogType, LogAccess> {
  const row = mode === "google" ? db.select({ scope: oauthTokens.scope, revokedAt: oauthTokens.revokedAt }).from(oauthTokens).get() : undefined;
  const granted = new Set(row?.scope.split(/\s+/));
  const of = (t: LogType): LogAccess =>
    mode === "demo" ? "demo" : !row ? "not_connected" : row.revokedAt !== null || !granted.has(scopeUrl(t)) ? "reconnect" : "ok";
  return Object.fromEntries(LOG_TYPES.map((t) => [t, of(t)])) as Record<LogType, LogAccess>;
}

export type LogWriter = Pick<GoogleClient, "create" | "batchDelete">;
export type NewEntry = { type: LogType; ts: number; data: unknown };
export type LogResult = { ok: true } | { ok: false; reason: "reconnect" | "failed" };

/** 403 is a grant without the write scope (made before Pulse asked for it); revoked means the same fix. */
const failure = (e: unknown): LogResult => {
  if (e instanceof GoogleError && (e.status === 403 || e.code === "auth_revoked" || e.code === "not_connected")) return { ok: false, reason: "reconnect" };
  if (e instanceof GoogleError) {
    console.warn(`[log] ${e.message}`); // status and code only (GoogleError never carries a body)
    return { ok: false, reason: "failed" };
  }
  throw e;
};

/**
 * Writes each entry to Google (with `writer`; null keeps it local, as demo mode does), then stores it with the
 * name Google gave it. Entries go in order; one that fails stops the rest, and those already written stay.
 */
export async function saveEntries(db: Db, entries: NewEntry[], o: { tz: string; writer: LogWriter | null; now: number }): Promise<LogResult> {
  for (const e of entries) {
    let googleName: string | null = null;
    try {
      if (o.writer) googleName = await o.writer.create(e.type, toDataPoint(e.type, e.data, e.ts, o.tz));
    } catch (err) {
      return failure(err);
    }
    db.insert(loggedEntries)
      .values({ id: randomUUID(), type: e.type, ts: e.ts, day: localDay(e.ts, o.tz), data: e.data, googleName, createdAt: o.now })
      .run();
  }
  return { ok: true };
}

/** Deletes an entry at Google (when it was written there) and then here. Already gone at Google counts as deleted. */
export async function deleteEntry(db: Db, id: string, writer: LogWriter | null): Promise<LogResult & { type?: LogType }> {
  const row = db.select().from(loggedEntries).where(eq(loggedEntries.id, id)).get();
  if (!row) return { ok: true };
  if (row.googleName && writer) {
    try {
      await writer.batchDelete(row.type, [row.googleName]);
    } catch (err) {
      if (!(err instanceof GoogleError && (err.status === 404 || err.code === "NOT_FOUND"))) return failure(err);
    }
  }
  db.delete(loggedEntries).where(eq(loggedEntries.id, id)).run();
  return { ok: true, type: row.type as LogType };
}

export type LoggedEntry = { id: string; type: LogType; ts: number; day: string; title: string; detail: string; atGoogle: boolean };

/** Entries logged at or after `fromTs`, newest first. */
export function recentEntries(db: Db, fromTs: number, limit = 50): LoggedEntry[] {
  const rows = db.$client
    .prepare("select id, type, ts, day, data, google_name from logged_entries where ts >= ? order by ts desc, created_at desc limit ?")
    .all(fromTs, limit) as { id: string; type: LogType; ts: number; day: string; data: string; google_name: string | null }[];
  return rows.map((r) => ({ id: r.id, type: r.type, ts: r.ts, day: r.day, ...describeEntry(r.type, JSON.parse(r.data)), atGoogle: r.google_name !== null }));
}

/**
 * Water drunk on `day`: Google's roll-up (the sync owns totals, from every app) plus what Pulse logged after the
 * last hydration sync, which that roll-up cannot hold yet. So an entry is counted once, before and after the sync.
 */
export function waterOn(db: Db, day: string): number {
  const synced = (db.$client.prepare("select value from daily_values where day = ? and key = 'water'").get(day) as { value: number } | undefined)?.value ?? 0;
  const since =
    (db.$client.prepare("select last_success_at t from sync_state where type = 'hydration-log'").get() as { t: number | null } | undefined)?.t ?? 0;
  const pending = db.$client
    .prepare("select data from logged_entries where type = 'hydration-log' and day = ? and created_at > ?")
    .all(day, since) as { data: string }[];
  return synced + pending.reduce((s, r) => s + (JSON.parse(r.data) as { ml: number }).ml, 0);
}

export const isReadable = (t: LogType) => READABLE.has(t);
