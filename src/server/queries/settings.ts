// More, Settings and the shell's status (spec §7.14, §4.2). Pages also call worker.requestSync() on load.
import { SCORING_VERSION } from "../pipeline";
import { missingScopes } from "../sources/google/oauth";
import { addDays, wholeYears } from "../time";
import { defaultCtx, firstDay, type QueryCtx, todayOf } from "./common";
import { latestReport } from "./home";
import type { MoreVM, SettingsVM, ShellStatusVM, YourDataVM } from "./types";

export { requestSync } from "../worker";

export const APP_VERSION = "0.1.0";
const STALE_MS = 2 * 3600_000;

/** Google sync jobs grouped as Settings lists them. */
const GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "heart-rate", label: "Heart rate", types: ["heart-rate"] },
  { key: "steps", label: "Steps", types: ["steps", "steps-daily"] },
  { key: "sleep", label: "Sleep", types: ["sleep"] },
  { key: "hrv", label: "Heart rate variability", types: ["daily-heart-rate-variability"] },
  { key: "rhr", label: "Resting heart rate", types: ["daily-resting-heart-rate"] },
  { key: "resp", label: "Respiratory rate", types: ["daily-respiratory-rate"] },
  { key: "temp", label: "Skin temperature", types: ["daily-sleep-temperature-derivations"] },
  { key: "zones", label: "Heart rate zones", types: ["daily-heart-rate-zones", "time-in-heart-rate-zone"] },
  { key: "ranges", label: "Personal ranges", types: ["rhr-personal-range", "hrv-personal-range"] },
  { key: "spo2", label: "Blood oxygen", types: ["daily-oxygen-saturation"] },
  { key: "exercise", label: "Exercise", types: ["exercise"] },
  { key: "vo2max", label: "VO2 max", types: ["daily-vo2-max", "run-vo2-max"] },
  { key: "calories", label: "Calories", types: ["total-calories"] },
  { key: "weight", label: "Weight and body fat", types: ["weight", "body-fat", "height"] },
  { key: "activity", label: "Distance, floors and active minutes", types: ["distance", "floors", "altitude", "active-zone-minutes", "active-minutes", "active-energy-burned", "sedentary-period", "heart-rate-daily", "swim-lengths-data"] },
  { key: "nutrition", label: "Food and water", types: ["hydration-log", "nutrition-log"] },
  { key: "vitals", label: "Glucose and core temperature", types: ["blood-glucose", "core-body-temperature"] },
  { key: "rhythm", label: "ECG and irregular rhythm", types: ["electrocardiogram", "irregular-rhythm-notification"] },
];

/**
 * Shown-only types (extra metrics, records, height) and the Google inputs Pulse falls back from (zones, personal
 * ranges). Optional for the shell: one that fails (a scope granted only on
 * the next sign-in, a type the account never has) shows in Settings, but never turns the sync dot red or holds the
 * import banner open.
 */
const OPTIONAL_TYPES = new Set(GROUPS.filter((g) => ["zones", "ranges", "activity", "nutrition", "vitals", "rhythm"].includes(g.key)).flatMap((g) => g.types).concat("height"));

type SyncRow = {
  type: string;
  lastSuccessAt: number | null;
  lastError: string | null;
  backfillDaysDone: number | null;
  backfillDaysTotal: number | null;
};

function syncRows(ctx: QueryCtx) {
  return ctx.db.$client
    .prepare("select type, last_success_at lastSuccessAt, last_error lastError, backfill_days_done backfillDaysDone, backfill_days_total backfillDaysTotal from sync_state")
    .all() as SyncRow[];
}

/** The sync worker's paired-device check (sources/google/sync.ts `DEVICES_KEY`): account state, not a data type. */
const DEVICES_ROW = "paired-devices";

/**
 * "not_linked": the grant works but the Google account has no Google Health profile, so every type fails the same way.
 * "no_device": it has a profile but no paired Fitbit device, so every type imports nothing.
 */
function authState(ctx: QueryCtx, rows: SyncRow[]): "not_connected" | "not_linked" | "no_device" | "connected" | "revoked" {
  const t = ctx.db.$client.prepare("select revoked_at revokedAt from oauth_tokens where id = 1").get() as { revokedAt: number | null } | undefined;
  if (!t) return "not_connected";
  if (t.revokedAt != null) return "revoked";
  if (rows.some((r) => r.lastError?.includes("ACCOUNT_NOT_LINKED"))) return "not_linked";
  return rows.some((r) => r.type === DEVICES_ROW && r.lastError?.includes("NO_PAIRED_DEVICE")) ? "no_device" : "connected";
}

/**
 * A sync error as a person reads it. `last_error` is `[google] <type>: <CODE> (HTTP n)` (GoogleError); the
 * code is kept in brackets for a bug report, the rest is dropped.
 */
export function syncErrorText(raw: string): string {
  const code = /: ([A-Za-z_0-9]+)(?: \(HTTP \d+\))?$/.exec(raw)?.[1] ?? raw;
  const text: Record<string, string> = {
    ACCOUNT_NOT_LINKED: "No Google Health profile",
    auth_revoked: "Access revoked",
    not_connected: "Not connected",
    RESOURCE_EXHAUSTED: "Rate limited, retrying",
    http_429: "Rate limited, retrying",
    PERMISSION_DENIED: "Permission missing",
  };
  return text[code] ?? (/^http_5\d\d$/.test(code) ? "Google is having trouble, retrying" : `Failed (${code})`);
}

function importProgress(rows: SyncRow[]) {
  const pending = rows.filter((r) => r.backfillDaysTotal != null && (r.backfillDaysDone ?? 0) < r.backfillDaysTotal);
  if (!pending.length) return null;
  return { done: Math.min(...pending.map((r) => r.backfillDaysDone ?? 0)), total: Math.max(...pending.map((r) => r.backfillDaysTotal!)) };
}

/** Settings `/settings`: data source, auth, per-type sync status, backfill progress and the read-only profile. */
export function getSettings(ctx: QueryCtx = defaultCtx()): SettingsVM {
  const nowMs = ctx.now * 1000;
  const rows = syncRows(ctx);
  const statusOf = (last: number | null, error: string | null) =>
    error ? "error" : last == null ? "never" : nowMs - last * 1000 > STALE_MS ? "stale" : "ok";
  const auth = authState(ctx, rows);
  // Not linked is one account-level problem, said once in Data source, not on every row.
  const rowError = (e: string | null) => (e && auth !== "not_linked" ? syncErrorText(e) : null);
  const sync: SettingsVM["sync"] =
    ctx.mode === "demo"
      ? rows
          .filter((r) => r.type === "seed")
          .map((r) => ({ key: "seed", label: "Demo generator", lastSuccessAt: r.lastSuccessAt && r.lastSuccessAt * 1000, status: statusOf(r.lastSuccessAt, r.lastError), error: rowError(r.lastError) }))
      : GROUPS.map((g) => {
          const members = rows.filter((r) => g.types.includes(r.type));
          const successes = members.map((r) => r.lastSuccessAt);
          const last = members.length && successes.every((s) => s != null) ? Math.min(...(successes as number[])) : null;
          const error = rowError(members.find((r) => r.lastError)?.lastError ?? null);
          return { key: g.key, label: g.label, lastSuccessAt: last && last * 1000, status: statusOf(last, error), error };
        });
  const p = ctx.profile;
  const today = todayOf(ctx);
  return {
    mode: ctx.mode,
    source:
      ctx.mode === "demo"
        ? { label: "Demo data", status: "demo" }
        : { label: "Google Health", status: auth, needsPermissions: (auth === "connected" || auth === "no_device") && missingScopes(ctx.db).length > 0 },
    import: ctx.mode === "google" && auth === "connected" ? importProgress(rows) : null,
    sync,
    profile: {
      birthDate: p.birthDate,
      age: wholeYears(p.birthDate, today),
      sex: p.sex,
      maxHr: p.maxHr,
      maxHrSource: p.maxHrSource,
      timeZone: ctx.timeZone,
      heightCm: p.heightCm,
    },
    version: APP_VERSION,
    scoringVersion: SCORING_VERSION,
  };
}

/** More `/more`. */
export function getMore(ctx: QueryCtx = defaultCtx()): MoreVM {
  const c = ctx.db.$client;
  const tags = c.prepare("select count(*) total, coalesce(sum(hidden = 0), 0) shown from journal_tags").get() as { total: number; shown: number };
  return {
    latestWeek: latestReport(ctx, "week"),
    latestMonth: latestReport(ctx, "month"),
    reportCount: c.prepare("select count(*) from reports where json_extract(data, '$.days') > 0").pluck().get() as number,
    behaviours: { shown: tags.shown, total: tags.total },
    mode: ctx.mode,
    version: APP_VERSION,
    scoringVersion: SCORING_VERSION,
  };
}

/** Your data `/more/data`: what each export holds. */
export function getYourData(ctx: QueryCtx = defaultCtx()): YourDataVM {
  const c = ctx.db.$client;
  const first = firstDay(ctx);
  const today = todayOf(ctx);
  return {
    first,
    days: first ? (c.prepare("select count(*) from daily_scores where day <= ?").pluck().get(today) as number) : 0,
    answers: c.prepare("select count(*) from journal_entries").pluck().get() as number,
    mode: ctx.mode,
  };
}

/** Today counts toward the streak once it has this many minutes of heart rate; until then the streak ends yesterday. */
const STREAK_TODAY_MIN = 6 * 60;

/**
 * Consecutive worn days (spec §4.3, I4): the reference app's "continuous data" streak. A day is worn when it has any
 * heart rate, the same rule that keeps `band_not_worn` off its Strain. Null when the streak is 0.
 */
export function getWearStreak(ctx: QueryCtx = defaultCtx()): { days: number; asOf: string } | null {
  const today = todayOf(ctx);
  const rows = ctx.db.$client
    .prepare(
      `select day, coalesce(json_extract(strain, '$.hrCount'), 0) hr,
         coalesce(json_extract(strain, '$.hrMinutesAm'), 0) + coalesce(json_extract(strain, '$.hrMinutesPm'), 0) minutes
       from daily_scores where day <= ? order by day desc`,
    )
    .iterate(today) as Iterable<{ day: string; hr: number; minutes: number }>;
  let expected = today;
  let asOf: string | null = null;
  let days = 0;
  for (const r of rows) {
    if (r.day !== expected) break;
    expected = addDays(r.day, -1);
    // Today neither counts nor breaks the streak until it has enough data.
    if (r.day === today && r.minutes < STREAK_TODAY_MIN) continue;
    if (r.hr <= 0) break;
    asOf ??= r.day;
    days++;
  }
  return days > 0 && asOf ? { days, asOf } : null;
}

/** The AppShell's ShellStatus (top bar, sync dot, demo chip, ConnectionBanner). */
/** True while the sync worker is mid-run (read off its global, so queries don't import the worker and its sources). */
const workerRunning = () => !!(globalThis as { __pulseWorker?: { state?: { running?: boolean } } }).__pulseWorker?.state?.running

export function getShellStatus(ctx: QueryCtx = defaultCtx()): ShellStatusVM {
  const all = syncRows(ctx);
  // The device check is account state (connection below), not a sync that succeeded or failed.
  const rows = all.filter((r) => (ctx.mode === "demo" ? r.type === "seed" : r.type !== "seed" && r.type !== DEVICES_ROW && !OPTIONAL_TYPES.has(r.type)));
  const successes = rows.map((r) => r.lastSuccessAt).filter((s): s is number => s != null);
  const lastSuccessAt = successes.length ? Math.max(...successes) * 1000 : null;
  const stale = lastSuccessAt == null || ctx.now * 1000 - lastSuccessAt > STALE_MS;
  const error = rows.some((r) => r.lastError);
  const auth = ctx.mode === "google" ? authState(ctx, all) : "connected";
  const progress = ctx.mode === "google" && auth === "connected" ? importProgress(rows) : null;
  const first = firstDay(ctx);
  const connection: ShellStatusVM["connection"] =
    ctx.mode === "demo"
      ? "connected"
      : auth === "not_connected" || auth === "not_linked" || auth === "no_device"
        ? auth
        : auth === "revoked"
          ? "auth_revoked"
          : progress
            ? "importing"
            : stale
              ? "stale"
              : "connected";
  return {
    mode: ctx.mode,
    sync: { state: workerRunning() ? "syncing" : error ? "error" : stale ? "stale" : "ok", lastSuccessAt },
    connection,
    ...(progress && { importProgress: progress }),
    today: todayOf(ctx),
    ...(first && { firstDay: first }),
    timeZone: ctx.timeZone,
    streak: getWearStreak(ctx),
  };
}
