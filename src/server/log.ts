// Logging from Pulse (spec §11 LG1): what the user logs is written to Google Health and mirrored in
// `logged_entries`, the only copy Pulse can read of the write-only types. Demo mode keeps it local. The other way,
// the sync brings the readable types logged in other apps home here too (`importEntries`).
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { describeEntry, LOG_TYPES, READABLE, scopeUrl, type LogType } from "@/lib/log";
import { type Db, row, sql } from "./db";
import { loggedEntries, oauthTokens } from "./db/schema";
import type { GoogleClient } from "./sources/google/client";
import { GoogleError } from "./sources/google/oauth";
import type { MappedEntry, ReadableLogType } from "./sources/google/map";
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

export type LogWriter = Pick<GoogleClient, "create" | "batchDelete" | "exists">;
/** Reads one data point back: false only when Google answers "not found". */
export type PointCheck = (name: string) => Promise<boolean>;
export type NewEntry = { type: LogType; ts: number; data: unknown };
export type LogResult = { ok: true } | { ok: false; reason: "reconnect" | "failed" | "foreign" };

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

/**
 * Deletes an entry at Google (when it was written there) and then here. Already gone at Google counts as deleted,
 * except for another app's entry: Google may answer 404 for a point Pulse cannot touch, and deleting it here would
 * only bring it back on the next sync, so it stays and the user is sent to that app.
 */
export async function deleteEntry(db: Db, userId: number, id: string, writer: LogWriter | null): Promise<LogResult & { type?: LogType }> {
  const mine = and(eq(loggedEntries.userId, userId), eq(loggedEntries.id, id));
  const [row] = await db.select().from(loggedEntries).where(mine);
  if (!row) return { ok: true };
  if (row.googleName && writer) {
    const foreign = row.source === "google";
    if (foreign && (await logAccess(db, userId, "google"))[row.type as LogType] !== "ok") return { ok: false, reason: "reconnect" };
    try {
      await writer.batchDelete(row.type, [row.googleName]);
    } catch (err) {
      const missing = err instanceof GoogleError && (err.status === 404 || err.code === "NOT_FOUND");
      if (foreign && err instanceof GoogleError && err.status === 403) return { ok: false, reason: "foreign" };
      // A 404 on another app's point may only mean Pulse cannot touch it: gone only if Google cannot read it either.
      if (foreign && missing && (await writer.exists(row.type, row.googleName).catch(() => true))) return { ok: false, reason: "foreign" };
      if (!missing) return failure(err);
    }
  }
  await db.delete(loggedEntries).where(mine);
  return { ok: true, type: row.type as LogType };
}

/** `fromApp`: logged in another app and brought home by the sync. */
export type LoggedEntry = { id: string; type: LogType; ts: number; day: string; title: string; detail: string; atGoogle: boolean; fromApp: boolean };

/** A data point's id at Google: names carry the user as `users/{id}/` or `users/me/`, so only the tail is compared. */
const pointKey = (name: string) => name.slice(name.lastIndexOf("/") + 1);
/** proto3 drops zero, so an optional 0 g comes back absent: the two are the same entry. */
const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => JSON.stringify(v, (_, x) => (x === 0 ? null : x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  return norm(a) === norm(b);
};

/** A Pulse write younger than this is never taken for deleted: Google's list may not show it yet. */
export const IMPORT_GRACE_S = 15 * 60;

/**
 * Brings one readable type's Google data points in [from, to) home to `logged_entries`, so what is logged in another
 * app (or edited or deleted there) shows in Journal › Log. A point Pulse already holds (by name) is updated when it
 * changed; one Pulse wrote but holds without a name (an unfinished write) is matched on time and values and gets
 * its name; anything else is a new `google` entry. When `complete` (every point was readable), the named entries
 * Google no longer returns come back as `missing`, for `pruneEntries` to confirm one by one outside any transaction:
 * a short or empty page must never clear the log.
 */
export async function importEntries(
  db: Db,
  userId: number,
  type: ReadableLogType,
  points: { entries: MappedEntry[]; complete: boolean },
  o: { from: number; to: number; now: number },
): Promise<{ changed: boolean; missing: { id: string; googleName: string }[] }> {
  const mine = and(eq(loggedEntries.userId, userId), eq(loggedEntries.type, type), gte(loggedEntries.ts, o.from), lt(loggedEntries.ts, o.to));
  const held = await db.select().from(loggedEntries).where(mine);
  const byKey = new Map(held.filter((r) => r.googleName).map((r) => [pointKey(r.googleName!), r]));
  const unnamed = held.filter((r) => !r.googleName);
  const seen = new Set<string>();
  let changed = false;

  for (const e of points.entries) {
    const key = pointKey(e.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = byKey.get(key);
    if (r) {
      if (r.ts !== e.ts || r.day !== e.day || !same(r.data, e.data)) {
        await db.update(loggedEntries).set({ ts: e.ts, day: e.day, data: e.data }).where(and(eq(loggedEntries.userId, userId), eq(loggedEntries.id, r.id)));
        changed = true;
      }
      continue;
    }
    const i = unnamed.findIndex((u) => u.ts === e.ts && same(u.data, e.data));
    if (i >= 0) {
      const [u] = unnamed.splice(i, 1);
      await db.update(loggedEntries).set({ googleName: e.name }).where(and(eq(loggedEntries.userId, userId), eq(loggedEntries.id, u.id)));
    } else {
      await db.insert(loggedEntries).values({ userId, id: randomUUID(), type, ts: e.ts, day: e.day, data: e.data, googleName: e.name, source: "google", createdAt: o.now });
    }
    changed = true;
  }

  const settled = (r: (typeof held)[number]) => r.source === "google" || r.createdAt <= o.now - IMPORT_GRACE_S;
  const missing = points.complete
    ? held.filter((r) => r.googleName && !seen.has(pointKey(r.googleName)) && settled(r)).map((r) => ({ id: r.id, googleName: r.googleName! }))
    : [];
  return { changed, missing };
}

/** Read-backs one sync may spend on missing entries; the rest wait for the next run. */
export const PRUNE_CHECKS = 20;

/**
 * Deletes the missing entries Google answers "not found" for (`check`). Any other answer keeps the entry; the first
 * such error is returned for the sync state. Returns how many were deleted.
 */
export async function pruneEntries(db: Db, userId: number, missing: { id: string; googleName: string }[], check: PointCheck): Promise<{ deleted: number; error: unknown }> {
  const gone: string[] = [];
  let error: unknown = null;
  for (const m of missing.slice(0, PRUNE_CHECKS)) {
    try {
      if (!(await check(m.googleName))) gone.push(m.id);
    } catch (err) {
      error ??= err;
    }
  }
  if (gone.length) await db.delete(loggedEntries).where(and(eq(loggedEntries.userId, userId), inArray(loggedEntries.id, gone)));
  return { deleted: gone.length, error };
}

/** Entries logged at or after `fromTs`, newest first. */
export async function recentEntries(db: Db, userId: number, fromTs: number, limit = 500): Promise<LoggedEntry[]> {
  const rows = await db
    .select()
    .from(loggedEntries)
    .where(and(eq(loggedEntries.userId, userId), gte(loggedEntries.ts, fromTs)))
    .orderBy(desc(loggedEntries.ts), desc(loggedEntries.createdAt))
    .limit(limit);
  return rows.map(toEntry);
}

const toEntry = (r: typeof loggedEntries.$inferSelect): LoggedEntry => ({
  id: r.id,
  type: r.type as LogType,
  ts: r.ts,
  day: r.day,
  ...describeEntry(r.type as LogType, r.data),
  atGoogle: r.googleName !== null,
  fromApp: r.source === "google",
});

/** One type's entries on one local day, oldest first. No limit: another app can log many a day. */
export async function entriesOn(db: Db, userId: number, type: LogType, day: string): Promise<LoggedEntry[]> {
  const rows = await db
    .select()
    .from(loggedEntries)
    .where(and(eq(loggedEntries.userId, userId), eq(loggedEntries.type, type), eq(loggedEntries.day, day)))
    .orderBy(loggedEntries.ts, loggedEntries.createdAt);
  return rows.map(toEntry);
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
        where user_id = ${userId} and type = 'hydration-log' and day = ${day} and source = 'pulse'
          and created_at > coalesce((select last_success_at from sync_state where user_id = ${userId} and type = 'hydration-log'), 0)), 0) pending`,
  );
  return Number(r?.synced ?? 0) + Number(r?.pending ?? 0);
}

export const isReadable = (t: LogType) => READABLE.has(t);
