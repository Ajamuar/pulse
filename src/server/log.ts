// Logging from Pulse (spec §11 LG1): what the user logs is written to Google Health and mirrored in
// `logged_entries`, the only copy Pulse can read of the write-only types. Demo mode keeps it local.
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { describeEntry, LOG_TYPES, READABLE, scopeUrl, type LogType } from "@/lib/log";
import { type Db, row, sql } from "./db";
import { loggedEntries, oauthTokens } from "./db/schema";
import type { GoogleClient } from "./sources/google/client";
import { GoogleError } from "./sources/google/oauth";
import { toDataPoint } from "./sources/google/write";
import { localDay } from "./time";

/** `demo`: kept in Pulse only. `reconnect`: the grant lacks this type's write scope (or was revoked). */
export type LogAccess = "demo" | "ok" | "reconnect" | "not_connected";

export async function logAccess(db: Db, userId: number, mode: "demo" | "google"): Promise<Record<LogType, LogAccess>> {
  const [row] =
    mode === "google"
      ? await db.select({ scope: oauthTokens.scope, revokedAt: oauthTokens.revokedAt }).from(oauthTokens).where(eq(oauthTokens.userId, userId))
      : [];
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
export async function saveEntries(db: Db, userId: number, entries: NewEntry[], o: { tz: string; writer: LogWriter | null; now: number }): Promise<LogResult> {
  for (const e of entries) {
    let googleName: string | null = null;
    try {
      if (o.writer) googleName = await o.writer.create(e.type, toDataPoint(e.type, e.data, e.ts, o.tz));
    } catch (err) {
      return failure(err);
    }
    await db
      .insert(loggedEntries)
      .values({ userId, id: randomUUID(), type: e.type, ts: e.ts, day: localDay(e.ts, o.tz), data: e.data, googleName, createdAt: o.now });
  }
  return { ok: true };
}

/** Deletes an entry at Google (when it was written there) and then here. Already gone at Google counts as deleted. */
export async function deleteEntry(db: Db, userId: number, id: string, writer: LogWriter | null): Promise<LogResult & { type?: LogType }> {
  const mine = and(eq(loggedEntries.userId, userId), eq(loggedEntries.id, id));
  const [row] = await db.select().from(loggedEntries).where(mine);
  if (!row) return { ok: true };
  if (row.googleName && writer) {
    try {
      await writer.batchDelete(row.type, [row.googleName]);
    } catch (err) {
      if (!(err instanceof GoogleError && (err.status === 404 || err.code === "NOT_FOUND"))) return failure(err);
    }
  }
  await db.delete(loggedEntries).where(mine);
  return { ok: true, type: row.type as LogType };
}

export type LoggedEntry = { id: string; type: LogType; ts: number; day: string; title: string; detail: string; atGoogle: boolean };

/** Entries logged at or after `fromTs`, newest first. */
export async function recentEntries(db: Db, userId: number, fromTs: number, limit = 50): Promise<LoggedEntry[]> {
  const rows = await db
    .select()
    .from(loggedEntries)
    .where(and(eq(loggedEntries.userId, userId), gte(loggedEntries.ts, fromTs)))
    .orderBy(desc(loggedEntries.ts), desc(loggedEntries.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    type: r.type as LogType,
    ts: r.ts,
    day: r.day,
    ...describeEntry(r.type as LogType, r.data),
    atGoogle: r.googleName !== null,
  }));
}

/**
 * Water drunk on `day`: Google's roll-up (the sync owns totals, from every app) plus what Pulse logged after the
 * last hydration sync, which that roll-up cannot hold yet. So an entry is counted once, before and after the sync.
 */
export async function waterOn(db: Db, userId: number, day: string): Promise<number> {
  const r = await row<{ synced: number; pending: number }>(
    db,
    sql`select
      coalesce((select value from daily_values where user_id = ${userId} and day = ${day} and key = 'water'), 0) synced,
      coalesce((select sum((data->>'ml')::numeric) from logged_entries
        where user_id = ${userId} and type = 'hydration-log' and day = ${day}
          and created_at > coalesce((select last_success_at from sync_state where user_id = ${userId} and type = 'hydration-log'), 0)), 0) pending`,
  );
  return Number(r?.synced ?? 0) + Number(r?.pending ?? 0);
}

export const isReadable = (t: LogType) => READABLE.has(t);
