// Home's My Dashboard catalogue: every metric the Home view model computes, in the default order (spec §7.1 row 8, §11 CD1).

export const DASHBOARD_METRICS = [
  { key: "hrv", label: "Heart rate variability" },
  { key: "rhr", label: "Resting heart rate" },
  { key: "resp", label: "Respiratory rate" },
  { key: "sleep", label: "Sleep performance" },
  { key: "calories", label: "Calories" },
  { key: "steps", label: "Steps" },
  { key: "spo2", label: "Blood oxygen" },
  { key: "skin", label: "Skin temperature" },
] as const

export type DashboardKey = (typeof DASHBOARD_METRICS)[number]["key"]

export const DASHBOARD_KEYS: DashboardKey[] = DASHBOARD_METRICS.map((m) => m.key)

export const DASHBOARD_LABEL = Object.fromEntries(DASHBOARD_METRICS.map((m) => [m.key, m.label])) as Record<DashboardKey, string>

export const isDashboardKey = (k: string): k is DashboardKey => Object.hasOwn(DASHBOARD_LABEL, k)
