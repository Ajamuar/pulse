// The avatar (Home header, Settings › Account): an uploaded photo, else the owner's Google photo, else
// AVATAR_URL or public/avatar.*, else null, which the UI draws as the outline person icon.
import { existsSync } from "node:fs";
import path from "node:path";
import { getConfig } from "./config";
import type { Db } from "./db";
import { instance } from "./db/schema";

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// Settings crops and re-encodes to a 512 px WebP (~50–150 KB) in the browser, so 1 MB is ample and stays under
// the Server Action body limit (next.config.ts).
export const AVATAR_MAX_BYTES = 1024 * 1024;

export function setOwnerPicture(db: Db, picture: string | null) {
  if (picture) db.update(instance).set({ ownerPicture: picture }).run();
}

/** The owner's Google display name, kept from the last sign-in. */
export function setOwnerName(db: Db, name: string | null) {
  if (name) db.update(instance).set({ ownerName: name }).run();
}

/** The connected Google account's email, from the last Connect Google; Settings shows it. */
export const connectedGoogleEmail = (db: Db): string | null => db.select({ e: instance.googleEmail }).from(instance).get()?.e ?? null;

export function setGoogleEmail(db: Db, email: string) {
  db.update(instance).set({ googleEmail: email }).run();
}

/** Synced and derived tables: everything a Google account brought in, and what was computed from it. */
const SYNCED = [
  "sync_state", "raw_payloads", "hr_samples", "steps_minutes", "daily_metrics", "sleep_segments", "sleep_sessions",
  "exercises", "daily_values", "health_records", "intraday_dirty", "daily_scores", "intraday_series", "reports",
] as const;

/**
 * Clears what the previous Google account synced, so a switch starts a fresh import and two people's data never
 * mix. Journal entries, the profile, the dashboard and an uploaded avatar stay. ponytail: a sync already mid-run
 * can still land a few of the old account's rows; the forced re-sync right after keeps that to the run in flight.
 */
export function forgetSyncedData(db: Db) {
  db.$client.transaction(() => {
    for (const t of SYNCED) db.$client.prepare(`DELETE FROM ${t}`).run();
    db.update(instance).set({ ownerPicture: null, ownerName: null }).run();
  })();
}

export const ownerName = (db: Db): string | null => db.select({ name: instance.ownerName }).from(instance).get()?.name ?? null;

export function avatarSrc(db: Db): string | null {
  const row = db.select({ at: instance.avatarAt, google: instance.ownerPicture }).from(instance).get();
  if (row?.at) return `/avatar?v=${row.at}`;
  if (row?.google) return row.google;
  const file = ["avatar.jpg", "avatar.png", "avatar.webp"].find((f) => existsSync(path.join(process.cwd(), "public", f)));
  return getConfig().avatarUrl ?? (file ? `/${file}` : null);
}

/** The uploaded photo, for GET /avatar. */
export function uploadedAvatar(db: Db) {
  const row = db.select({ bytes: instance.avatar, type: instance.avatarType }).from(instance).get();
  return row?.bytes && row.type ? { bytes: row.bytes, type: row.type } : null;
}

/** Stores an upload (type and size checked by the caller's schema); null removes it. */
export function setAvatar(db: Db, file: { bytes: Buffer; type: string } | null, now = Math.floor(Date.now() / 1000)) {
  db.update(instance)
    .set(file ? { avatar: file.bytes, avatarType: file.type, avatarAt: now } : { avatar: null, avatarType: null, avatarAt: null })
    .run();
}
