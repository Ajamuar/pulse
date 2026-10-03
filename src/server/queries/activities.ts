import { addDays } from "../time";
import { activityItem, defaultCtx, exercisesBetween, loadDays, type QueryCtx, todayOf, toStrain } from "./common";
import type { ActivitiesVM } from "./types";

/** Days per page of `/activities`; "Show older" adds another page. */
export const ACTIVITY_PAGE_DAYS = 30;

/**
 * Activities `/activities`: every workout in the last `days` days, newest first, grouped by local day. Only days with a
 * workout get a group, except today, which always leads so the page answers "anything yet today?".
 */
export function getActivities(days = ACTIVITY_PAGE_DAYS, ctx: QueryCtx = defaultCtx()): ActivitiesVM {
  const today = todayOf(ctx);
  const from = addDays(today, -(days - 1));
  const rows = loadDays(ctx, from, today);
  const exs = exercisesBetween(ctx, from, today);
  const byDay = new Map<string, typeof exs>([[today, []]]);
  for (const e of exs) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);

  const groups = [...byDay.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((day) => {
      const row = rows.get(day);
      const items = byDay.get(day)!.map((e) => activityItem(e, row)).sort((a, b) => b.start - a.start);
      const minutes = items.reduce((m, a) => m + (a.end - a.start) / 60_000, 0);
      return {
        day,
        items,
        minutes,
        steps: row?.metrics?.steps ?? null,
        dayStrain: row?.s1?.effort != null ? toStrain(row.s1.effort) : null,
      };
    });
  const older = ctx.db.$client.prepare("select 1 from exercises where day < ? limit 1").get(from) !== undefined;
  return { today, days, groups, older };
}
