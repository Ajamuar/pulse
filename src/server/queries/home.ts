import { BODY_METRICS, DASHBOARD_DEFAULT, DASHBOARD_LABEL, DASHBOARD_METRICS, type DashboardKey, isDashboardKey, PHONE_DEFAULT, PHONE_STATS } from "@/lib/dashboard";
import { EXTRA_METRICS, type ExtraKey, type ExtraMetric } from "@/lib/extraMetrics";
import { hmm } from "@/lib/format";
import { metricHref } from "@/lib/url";
import type { Db } from "../db";
import { addDays, localMinutes } from "../time";
import { insightOf as recoveryInsight } from "./recovery";
import { insightOf as sleepInsight } from "./sleep";
import { coach } from "./strain";
import {
  type DayRow,
  defaultCtx,
  hrReason,
  loadDays,
  loadSeries,
  maybe,
  minutePoints,
  ms,
  none,
  nightReason,
  ok,
  planVM,
  priorStats,
  type QueryCtx,
  recoveryMetric,
  sleepMetric,
  strainMetric,
  stressNow,
  timeline,
  todayOf,
  vitalReason,
  dayStartOf,
  finite,
  recoveryBand,
  toStrain,
} from "./common";
import type { EnergyBankVM, HomeVM, KeyStat, Metric, VitalKey } from "./types";

export const VITAL_LABEL: Record<VitalKey, string> = {
  resp: "Respiratory rate",
  spo2: "Blood oxygen",
  restingHr: "Resting heart rate",
  hrv: "Heart rate variability",
  skinTempDev: "Skin temperature",
};

/** Home `/` for `day` (spec §7.1). */
export function getHome(day: string, ctx: QueryCtx = defaultCtx()): HomeVM {
  const today = todayOf(ctx);
  const isToday = day === today;
  const stripStart = day < addDays(today, -29) ? day : addDays(today, -29);
  const rows = loadDays(ctx, addDays(stripStart, -30), today);
  const row = rows.get(day);

  const recovery = recoveryMetric(row, isToday);
  const sleep = sleepMetric(row, isToday);
  const strain = strainMetric(row);
  const target = row?.strainTarget?.reason === null ? ([row.strainTarget.low, row.strainTarget.high] as [number, number]) : null;
  const firstReason = [recovery, sleep, strain].find((m) => m.value == null);

  const strip: HomeVM["strip"] = [];
  for (let d = stripStart; d <= today; d = addDays(d, 1)) strip.push({ day: d, recovery: rows.get(d)?.recovery?.value ?? null });

  return {
    day,
    today,
    isToday,
    strip,
    dials: {
      sleep,
      recovery,
      strain,
      strainTarget: target,
      soFar: isToday,
      reason: firstReason ? { reason: firstReason.reason!, ...(firstReason.nightsLeft !== undefined && { nightsLeft: firstReason.nightsLeft }) } : null,
    },
    monitorAlert: monitorAlert(row),
    monitor: monitorSummary(row, isToday),
    stress: stressNow(row, isToday),
    activities: { title: isToday ? "Today’s activities" : "Activities", items: timeline(ctx, row, day) },
    energyBank: energyBankVM(ctx, row, day, isToday),
    tonight: planVM(ctx, row, isToday),
    keyStats: keyStats(rows, day, isToday, dashboardKeys(ctx.db)),
    dashboard: { defaults: dashboardDefault(ctx.db), empty: emptyKeys(rows, day, isToday) },
    phone: phoneDay(rows, day, isToday),
    weeklyTeaser: latestReport(ctx, "week"),
    outlook: outlookOf(ctx, row, { recovery, strain, target }, isToday),
    insights: isToday ? insightsOf(ctx, rows, row, day, { strain, target }) : [],
    journalWeek: journalWeek(ctx, day),
    strainRecovery: Array.from({ length: 7 }, (_, k) => {
      const d = addDays(day, k - 6);
      const r = rows.get(d);
      const e = r?.s1?.effort;
      const rec = r?.recovery?.value;
      // Today has no Strain score until effort accrues: a 0.0 would plot as a dive to the floor, so it is a gap (SYM4).
      const scored = finite(e) && (d !== today || e > 0);
      return { day: d, strain: scored ? toStrain(e) : null, recovery: finite(rec) ? rec : null };
    }),
  };
}

/** the reference app's banners switch from outlook to review at 17:00 (inferred, spec §12 I15). */
export const REVIEW_FROM_MIN = 17 * 60;
const f1 = (x: number) => x.toFixed(1);

type DayScores = { recovery: Metric<number>; strain: Metric<number>; target: [number, number] | null };

/** "Your daily outlook" / "Your day in review": a templated summary of the day's stored scores (spec §7.1 7a). */
export function outlookOf(ctx: QueryCtx, row: DayRow | undefined, s: DayScores, isToday: boolean): HomeVM["outlook"] {
  const review = !isToday || localMinutes(ctx.now, ctx.timeZone) >= REVIEW_FROM_MIN;
  const rec = s.recovery.value;
  const target = s.target ? `${f1(s.target[0])} - ${f1(s.target[1])}` : null;
  const parts: string[] = [];
  if (!review) {
    if (rec != null) parts.push(`Your Recovery is ${Math.round(rec)}%, ${recoveryBand(rec)}.`);
    if (target) parts.push(`Today’s Strain Target is ${target}.`);
    const main = row?.sleep?.main;
    if (main && row?.sleep?.needHours) parts.push(`You slept ${hmm(main.asleepMin)} of the ${hmm(row.sleep.needHours * 60)} you needed.`);
  } else {
    const n = row?.activities.length ?? 0;
    const acts = n ? `, with ${n} ${n === 1 ? "activity" : "activities"}` : "";
    if (s.strain.value != null) parts.push(`Day Strain ${isToday ? "is" : "was"} ${f1(s.strain.value)}${target ? ` against a target of ${target}` : ""}${acts}.`);
    if (rec != null) parts.push(`Recovery ${isToday ? "is" : "was"} ${Math.round(rec)}%.`);
    const st = row?.stress;
    if (st && st.average != null) parts.push(`You spent ${hmm(st.highMin)} in high stress.`);
  }
  if (!parts.length) return null;
  return { kind: review ? "review" : "outlook", title: review ? "Your day in review" : "Your daily outlook", body: parts.join(" ") };
}

const RECOVERY_TITLE = { green: "Ready for strain", yellow: "A steady day", red: "Time to recover" } as const;

/** Today's coach cards from the same templates the detail screens use (Strain Coach, Recovery, Sleep). */
function insightsOf(ctx: QueryCtx, rows: Map<string, DayRow>, row: DayRow | undefined, day: string, s: Pick<DayScores, "strain" | "target">): HomeVM["insights"] {
  const out: HomeVM["insights"] = [];
  const target = s.target ? { low: s.target[0], high: s.target[1] } : null;
  const c = coach(s.strain, target, row);
  if (c && target && s.strain.value != null) {
    const v = s.strain.value;
    const red = row?.recovery?.value != null && row.recovery.value < 34;
    const title = red ? "Keep strain light" : v < target.low ? "Room for more strain" : v <= target.high ? "Reaching optimal strain" : "Past your target";
    out.push({ key: "strain", title, body: c, href: "/strain" });
  }
  const r = row?.recovery;
  if (r?.value != null) out.push({ key: "recovery", title: RECOVERY_TITLE[recoveryBand(r.value)], body: recoveryInsight(r.drivers), href: "/recovery" });
  const sl = sleepInsight(rows, day, ctx.timeZone);
  if (sl) out.push({ key: "sleep", title: "Last night’s sleep", body: sl, href: "/sleep" });
  return out;
}

function journalWeek(ctx: QueryCtx, day: string): HomeVM["journalWeek"] {
  const from = addDays(day, -6);
  const done = new Set(ctx.db.$client.prepare("select distinct day from journal_entries where day >= ? and day <= ?").pluck().all(from, day) as string[]);
  return Array.from({ length: 7 }, (_, k) => {
    const d = addDays(from, k);
    return { day: d, done: done.has(d) };
  });
}

/** Raised (or agreeing with a logged illness) counts as the illness flag. */
export const illnessRaised = (hm: DayRow["healthMonitor"]) =>
  !!hm && hm.reason === null && (hm.illness.level === "raised" || (hm.illness.level === "alreadyUnwell" && hm.illness.score >= 50 && hm.illness.signalCount >= 2));

function monitorAlert(row: DayRow | undefined): HomeVM["monitorAlert"] {
  const hm = row?.healthMonitor;
  if (!hm || hm.reason !== null) return null;
  const flagged = hm.vitals.filter((v) => v.status === "high" || v.status === "low");
  const illness = illnessRaised(hm);
  if (!illness && !flagged.length) return null;
  return { kind: illness ? "illness" : "flagged", count: flagged.length, names: flagged.map((v) => VITAL_LABEL[v.key]) };
}

function monitorSummary(row: DayRow | undefined, isToday: boolean): HomeVM["monitor"] {
  const hm = row?.healthMonitor;
  if (!hm) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (hm.reason !== null) return none(nightReason(hm.reason, isToday));
  return ok({ inRange: hm.inRange, total: hm.vitals.length, flagged: hm.flagged });
}

export function energyBankVM(ctx: QueryCtx, row: DayRow | undefined, day: string, isToday: boolean): Metric<EnergyBankVM> {
  const eb = row?.energyBank;
  if (!eb) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (eb.value == null) return none(nightReason(eb.reason, isToday), row?.recovery?.nightsLeft);
  const start = dayStartOf(ctx, day);
  const wakeM = Math.max(0, Math.floor((eb.wake - start) / 60));
  const untilM = Math.ceil((eb.until - start) / 60);
  const curve = minutePoints(loadSeries(ctx, day, "energy_bank"), start, 5, wakeM, untilM).filter((p) => p.v != null);
  return ok(
    {
      current: eb.value,
      startLevel: eb.startLevel,
      startAt: ms(eb.wake),
      until: ms(eb.until),
      charged: eb.charged,
      drained: eb.drained,
      curve,
      drains: eb.topDrains.map((d) => ({ label: d.label, kind: d.kind, start: ms(d.start), amount: d.amount })),
      naps: eb.naps.map((n) => ({ start: ms(n.start), end: ms(n.end) })),
    },
    eb.provisional,
  );
}

/** True once any heart rate has synced: a phone-only account (no Fitbit band) has none. */
const hasBand = (db: Db) => !!db.$client.prepare("select 1 from hr_samples limit 1").get();

/** My Dashboard's default list: the v1 rows, or the phone metrics for an account that has never synced heart rate (§11 CD2). */
export const dashboardDefault = (db: Db): DashboardKey[] => (hasBand(db) ? DASHBOARD_DEFAULT : PHONE_DEFAULT);

/** My Dashboard's chosen metrics in order. Keys no longer in the catalogue are skipped; none chosen means the default list. */
export function dashboardKeys(db: Db): DashboardKey[] {
  const keys = (db.$client.prepare("select key from dashboard_metrics order by position").pluck().all() as string[]).filter(isDashboardKey);
  return keys.length ? keys : dashboardDefault(db);
}

type StatSpec = Omit<KeyStat, "key" | "label" | "average" | "sd"> & { pick: (r: DayRow) => number | null | undefined };

const spec = (
  pick: StatSpec["pick"],
  metric: Metric<number>,
  unit: string | undefined,
  direction: KeyStat["direction"],
  href?: string,
  format?: KeyStat["format"],
): StatSpec => ({ pick, metric, ...(unit && { unit }), direction, ...(href && { href }), ...(format && { format }) });

/** Each dashboard metric on `row`'s day: its value path (for averages), the metric with its reason, unit and link. */
function statSpecs(row: DayRow | undefined, isToday: boolean): Record<DashboardKey, StatSpec> {
  const m = row?.metrics;
  const rhr = (r: DayRow) => r.metrics?.rhrBpm ?? r.sessionRhr ?? null;
  const skin = (r: DayRow) => r.recovery?.inputs.skinTempDev ?? null;
  const skinReason = m?.nightlyTempC != null ? "calibrating" : vitalReason(row, isToday);
  const dailyReason = !row?.s1 || row.s1.hrCount === 0 ? hrReason(row?.s1 ?? null) : "no_data";
  const out = {
    hrv: spec((r) => r.metrics?.hrvMs, maybe(m?.hrvMs, vitalReason(row, isToday, true)), "ms", "up", "/recovery"),
    rhr: spec(rhr, maybe(row && rhr(row), vitalReason(row, isToday)), "bpm", "down", "/recovery"),
    resp: spec((r) => r.metrics?.respBpm, maybe(m?.respBpm, vitalReason(row, isToday)), "rpm", "neutral", "/health/monitor"),
    sleep: spec((r) => r.sleep?.performance, sleepMetric(row, isToday), "%", "up", "/sleep"),
    calories: spec((r) => r.metrics?.calories, maybe(m?.calories, dailyReason), "kcal", "neutral", metricHref("calories")),
    steps: spec((r) => r.metrics?.steps, maybe(m?.steps, dailyReason), undefined, "up", metricHref("steps")),
    spo2: spec((r) => r.metrics?.spo2Pct, maybe(m?.spo2Pct, vitalReason(row, isToday)), "%", "up", "/health/monitor"),
    skin: spec(skin, maybe(row && skin(row), skinReason), "°C", "toward_zero", "/health/monitor"),
  } as Record<DashboardKey, StatSpec>;
  // Shown-only readings: missing simply means Google had none for the day.
  for (const b of BODY_METRICS) {
    const pick = (r: DayRow) => (b.key === "weight" ? r.metrics?.weightKg : r.metrics?.bodyFatPct);
    out[b.key] = spec(pick, maybe(row && pick(row), "no_data"), b.unit, b.direction, b.href, b.format);
  }
  for (const e of EXTRA_METRICS as readonly ExtraMetric[])
    out[e.key as ExtraKey] = spec((r) => r.extra[e.key as ExtraKey], maybe(row?.extra[e.key as ExtraKey], "no_data"), e.unit, e.direction, metricHref(e.key), e.format);
  return out;
}

/** The dashboard rows for `keys`, in that order, each against its mean over the 30 days before `day`. */
export function keyStats(rows: Map<string, DayRow>, day: string, isToday: boolean, keys: DashboardKey[]): KeyStat[] {
  const specs = statSpecs(rows.get(day), isToday);
  return keys.map((key) => {
    const { pick, ...s } = specs[key];
    const { mean, sd } = priorStats(rows, day, pick);
    return { key, label: DASHBOARD_LABEL[key], ...s, average: mean, ...(sd !== undefined && { sd }) };
  });
}

/** Catalogue metrics with no value on `day` or in the 30 days before it: the editor marks them "No data yet". */
function emptyKeys(rows: Map<string, DayRow>, day: string, isToday: boolean): DashboardKey[] {
  const specs = statSpecs(rows.get(day), isToday);
  const days = Array.from({ length: 31 }, (_, k) => rows.get(addDays(day, -k))).filter((r): r is DayRow => !!r);
  return DASHBOARD_METRICS.map((m) => m.key).filter((key) => !days.some((r) => finite(specs[key].pick(r))));
}

/**
 * The band recorded no heart rate on `day` but the phone counted something: Home leads with those numbers (§11 CD2).
 * Null when the band was worn, or when the phone recorded nothing either.
 */
function phoneDay(rows: Map<string, DayRow>, day: string, isToday: boolean): KeyStat[] | null {
  const row = rows.get(day);
  if (!row || (row.s1 && row.s1.hrCount > 0)) return null;
  // Calories alone is Google's resting-burn estimate, there with or without a phone: it needs movement too.
  if (!row.metrics?.steps && !row.extra.distance && !row.activities.length) return null;
  const stats = keyStats(rows, day, isToday, PHONE_STATS).filter((s) => s.metric.value !== null);
  return stats.length ? stats : null;
}

/** The latest complete week or month with a report. */
export function latestReport(ctx: QueryCtx, kind: "week" | "month") {
  const like = kind === "week" ? "____-W__" : "____-__";
  const rows = ctx.db.$client
    .prepare("select period, data from reports where period like ? order by period desc limit 3")
    .all(like) as { period: string; data: string }[];
  for (const r of rows) {
    const d = JSON.parse(r.data) as { partial: boolean; start: string; end: string; days: number };
    if (!d.partial && d.days > 0) return { period: r.period, start: d.start, end: d.end };
  }
  return null;
}
