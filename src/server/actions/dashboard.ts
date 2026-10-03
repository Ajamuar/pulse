"use server";
// Home's My Dashboard (spec §11 CD1): which metrics it shows, in which order.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDashboardKey } from "@/lib/dashboard";
import { currentSession, SIGNED_OUT } from "../auth";
import { getDb } from "../db";
import { dashboardDefault } from "../queries/home";
import type { ActionResult } from "./journal";

const Dashboard = z.object({
  keys: z
    .array(z.string().refine(isDashboardKey, { message: "Unknown metric" }))
    .min(1, "Choose at least one metric")
    .refine((k) => new Set(k).size === k.length, { message: "A metric is listed twice" }),
});

/** Saves the chosen metrics in order. The default list is stored as no rows, so a later default change reaches it. */
export async function saveDashboard(input: z.input<typeof Dashboard>): Promise<ActionResult> {
  if (!(await currentSession())) return SIGNED_OUT;
  const r = Dashboard.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { keys } = r.data;
  const c = getDb().$client;
  const insert = c.prepare("insert into dashboard_metrics (key, position) values (?, ?)");
  const def = dashboardDefault(getDb());
  const isDefault = keys.length === def.length && keys.every((k, i) => k === def[i]);
  c.transaction(() => {
    c.prepare("delete from dashboard_metrics").run();
    if (!isDefault) keys.forEach((k, i) => insert.run(k, i));
  })();
  revalidatePath("/");
  return { ok: true, data: undefined };
}
