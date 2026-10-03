// Journal's Log section (spec §11 LG1): which sheets to offer, whether each can write to Google, and the recent log.
import { isCycleKind, KIND_TYPES, LOG_KINDS, type LogKind } from "@/lib/log";
import { logAccess, recentEntries, waterOn, type LogAccess, type LoggedEntry } from "../log";
import { addDays, localMidnight } from "../time";
import { defaultCtx, type QueryCtx, todayOf } from "./common";

export type LogVM = {
  /** Cycle kinds are absent on a male profile. */
  kinds: LogKind[];
  /** Per sheet: the worst access of the types it writes (weight needs weight and body fat). */
  access: Record<LogKind, LogAccess>;
  /** Today's water, synced roll-up plus what Pulse logged since that sync. */
  waterToday: number;
  /** The last 14 days, newest first. */
  recent: LoggedEntry[];
  today: string;
  timeZone: string;
};

const RANK: Record<LogAccess, number> = { ok: 0, demo: 0, reconnect: 1, not_connected: 2 };

export function getLog(ctx: QueryCtx = defaultCtx()): LogVM {
  const today = todayOf(ctx);
  const byType = logAccess(ctx.db, ctx.mode);
  const kinds = LOG_KINDS.filter((k) => ctx.profile.sex === "female" || !isCycleKind(k));
  const access = Object.fromEntries(
    LOG_KINDS.map((k) => [k, KIND_TYPES[k].map((t) => byType[t]).reduce((a, b) => (RANK[b] > RANK[a] ? b : a))]),
  ) as Record<LogKind, LogAccess>;
  return {
    kinds,
    access,
    waterToday: waterOn(ctx.db, today),
    // A male profile never sees cycle entries, even ones logged before the profile changed.
    recent: recentEntries(ctx.db, localMidnight(addDays(today, -13), ctx.timeZone)).filter(
      (e) => ctx.profile.sex === "female" || (e.type !== "menstrual-period" && e.type !== "ovulation-test"),
    ),
    today,
    timeZone: ctx.timeZone,
  };
}
