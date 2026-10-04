// The coach's tools: read-only, bound to the signed-in user's QueryCtx by closure (the model never names a user),
// each a compact digest of an existing screen query. A metric without a value carries its reason code instead, so
// the model can say "calibrating" rather than guess. No chart series, ids or raw payloads.
import { tool } from "ai";
import { z } from "zod";
import type { Metric } from "@/lib/reasons";
import { getActivities } from "../queries/activities";
import { firstDay, todayOf, type QueryCtx } from "../queries/common";
import { getHealthHub, getMonitor } from "../queries/health";
import { getJournalInsights } from "../queries/journal";
import { getRecovery } from "../queries/recovery";
import { getReport } from "../queries/reports";
import { getMore } from "../queries/settings";
import { getSleep } from "../queries/sleep";
import { getStrain } from "../queries/strain";
import { getStress } from "../queries/health";
import { getTrends, TREND_METRICS, type TrendMetricKey } from "../queries/trends";
import { addDays } from "../time";

const round = (v: number, dp = 0) => Math.round(v * 10 ** dp) / 10 ** dp;

/** A number metric as `{ value }` or `{ value: null, reason }`; provisional only when it is. */
export function num(m: Metric<number>, dp = 0) {
  if (m.value === null) return { value: null, reason: m.reason ?? "no_data", ...(m.nightsLeft !== undefined && { nightsLeft: m.nightsLeft }) };
  return { value: round(m.value, dp), ...(m.provisional && { provisional: true }) };
}

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Local day YYYY-MM-DD; omit for today");

/** The day asked for, clamped to [first day with data, today]: never a future day. */
async function dayOf(ctx: QueryCtx, day: string | undefined) {
  const today = todayOf(ctx);
  if (!day || day > today) return today;
  const first = await firstDay(ctx);
  return first && day < first ? first : day;
}

export async function dayDigest(ctx: QueryCtx, day: string) {
  const [rec, sleep, strain, stress] = await Promise.all([getRecovery(day, ctx), getSleep(day, ctx), getStrain(day, ctx), getStress(day, ctx)]);
  return {
    day,
    isToday: rec.isToday,
    recovery: {
      ...num(rec.recovery),
      unit: "%",
      band: rec.band,
      contributors: rec.contributors.map((c) => ({
        label: c.label,
        unit: c.unit,
        ...num(c.metric, 1),
        baseline: c.baseline && round(c.baseline.mean, 1),
        points: c.points === null ? null : round(c.points, 1),
      })),
    },
    sleep: {
      performance: { ...num(sleep.performance), unit: "%" },
      hoursAsleep: sleep.hours.value ? round(sleep.hours.value.asleepMin / 60, 1) : null,
      hoursNeeded: sleep.hoursVsNeed.value ? round(sleep.hoursVsNeed.value.needMin / 60, 1) : null,
      stages: sleep.stages?.value?.rows.map((r) => ({ stage: r.label, minutes: Math.round(r.minutes), pct: Math.round(r.pct) })) ?? null,
    },
    strain: {
      ...num(strain.strain, 1),
      scale: "0-21",
      soFar: strain.soFar,
      target: strain.target.value ? [round(strain.target.value.low, 1), round(strain.target.value.high, 1)] : null,
      coachLine: strain.coach,
    },
    stress: stress.gauge.value ? { value: Math.round(stress.gauge.value.value), level: stress.gauge.value.level } : num({ ...stress.gauge, value: null }),
  };
}

/** The tool set for one signed-in user. */
export function coachTools(ctx: QueryCtx) {
  return {
    get_day: tool({
      description: "Recovery (with what moved it), sleep, strain (with today's target) and stress for one day.",
      inputSchema: z.object({ day: Day }),
      execute: async ({ day }) => dayDigest(ctx, await dayOf(ctx, day)),
    }),
    get_trend: tool({
      description: "Averages of one metric: last 7 and 30 days (and 6 months, 1 year) against the period before each.",
      inputSchema: z.object({ metric: z.enum(TREND_METRICS.map((m) => m.key) as [TrendMetricKey, ...TrendMetricKey[]]) }),
      execute: async ({ metric }) => {
        const t = await getTrends(metric, ctx);
        const meta = TREND_METRICS.find((m) => m.key === metric)!;
        return {
          metric: meta.label,
          unit: meta.unit ?? null,
          reason: t.points.reason,
          periods: t.periods.map((p) => ({ range: p.range, average: num(p.average, 1), prior: p.prior === null ? null : round(p.prior, 1) })),
        };
      },
    }),
    get_activities: tool({
      description: "Workouts in the last N days: name, day, minutes, strain (0-21), distance.",
      inputSchema: z.object({ days: z.number().int().min(1).max(90).default(14) }),
      execute: async ({ days }) => {
        const a = await getActivities(days, ctx);
        return a.groups.flatMap((g) =>
          g.items.map((i) => ({
            day: g.day,
            name: i.name,
            minutes: Math.round((i.end - i.start) / 60_000),
            strain: num(i.strain, 1),
            distanceKm: i.distanceKm === null ? null : round(i.distanceKm, 1),
          })),
        );
      },
    }),
    get_journal_impacts: tool({
      description: "How logged behaviours (alcohol, late meal, ...) relate to recovery, HRV or sleep, from the user's own check-ins.",
      inputSchema: z.object({ outcome: z.enum(["recovery", "hrv", "sleep"]).default("recovery") }),
      execute: async ({ outcome }) => {
        const j = await getJournalInsights(outcome, ctx);
        return {
          outcome,
          unit: j.unit,
          effects: j.items.map((i) => ({ behaviour: i.label, delta: round(i.delta, 1), withAvg: i.avgWith, withoutAvg: i.avgWithout, yesDays: i.yes, noDays: i.no })),
          needsMoreData: j.needsMore.map((n) => n.label),
        };
      },
    }),
    get_health: tool({
      description: "Health Monitor vitals (in or out of the user's range, illness signal), Pulse Age, VO2 max and training load.",
      inputSchema: z.object({ day: Day }),
      execute: async ({ day }) => {
        const d = await dayOf(ctx, day);
        const [mon, hub] = await Promise.all([getMonitor(d, ctx), getHealthHub(ctx)]);
        return {
          day: d,
          vitals: mon.vitals.map((v) => ({ vital: v.label, unit: v.unit, ...num(v.metric, 1), status: v.status, range: v.range })),
          illness: mon.illness,
          pulseAge: hub.healthspan.value ? { years: round(hub.healthspan.value.pulseAge, 1), vsActualAge: round(hub.healthspan.value.deltaYears, 1) } : null,
          vo2max: hub.fitness.value ? { value: round(hub.fitness.value.vo2max, 1), category: hub.fitness.value.category } : null,
          trainingLoadRatio: hub.fitness.value?.acwr ?? null,
        };
      },
    }),
    get_report: tool({
      description: "The latest weekly or monthly report: averages, training balance, best and worst day.",
      inputSchema: z.object({ kind: z.enum(["week", "month"]).default("week") }),
      execute: async ({ kind }) => {
        const more = await getMore(ctx);
        const latest = kind === "week" ? more.latestWeek : more.latestMonth;
        const r = latest && (await getReport(latest.period, ctx));
        if (!r) return { report: null, reason: "no_data" };
        return {
          start: r.start,
          end: r.end,
          partial: r.partial,
          scores: r.dials.map((d) => ({ score: d.label, ...num(d.metric, 1), changeVsPrevious: d.delta })),
          averages: r.averages.map((a) => ({ label: a.label, unit: a.unit ?? null, ...num(a.metric, 1) })),
          trainingBalance: r.trainingBalance.value?.line ?? null,
          bestWorst: r.bestWorst,
          summary: r.insight,
        };
      },
    }),
    get_profile: tool({
      description: "Age, sex, max heart rate and time zone. Never the name or email.",
      inputSchema: z.object({}),
      execute: async () => {
        const p = ctx.profile;
        const age = Math.floor((Date.parse(todayOf(ctx)) - Date.parse(p.birthDate)) / (365.2425 * 86_400_000));
        return { age, sex: p.sex, maxHr: p.maxHr, timeZone: ctx.timeZone, firstDayWithData: await firstDay(ctx), today: todayOf(ctx), weekAgo: addDays(todayOf(ctx), -7) };
      },
    }),
  };
}

export type CoachTools = ReturnType<typeof coachTools>;
