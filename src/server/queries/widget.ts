// Today's three Home dials for the Android widget. Same builders as Home, so a missing score stays null.
import { loadDays, recoveryMetric, sleepMetric, strainMetric, todayOf, type QueryCtx } from "./common";

export type WidgetSnapshot = {
  sleep: { value: number | null };
  recovery: { value: number | null };
  /** Strain is on the 0–21 display scale. `target` is that day's Strain Target, when one exists. */
  strain: { value: number | null; target: [number, number] | null };
};

const finite = (v: number | null): number | null => (v != null && Number.isFinite(v) ? v : null);

/** Sleep, Recovery and Strain for today in the user's time zone. */
export async function getWidget(ctx: QueryCtx): Promise<WidgetSnapshot> {
  const today = todayOf(ctx);
  const row = (await loadDays(ctx, today, today)).get(today);
  const target = row?.strainTarget?.reason === null ? ([row.strainTarget.low, row.strainTarget.high] as [number, number]) : null;
  return {
    sleep: { value: finite(sleepMetric(row, true).value) },
    recovery: { value: finite(recoveryMetric(row, true).value) },
    strain: { value: finite(strainMetric(row).value), target },
  };
}
