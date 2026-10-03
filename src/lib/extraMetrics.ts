// Google Health daily roll-ups Pulse shows as they come, without scoring them (docs/research/google-health-coverage.md).
// One entry per metric: My Dashboard, Trends and the daily export all read this list, so adding a metric here
// (and its value path in src/server/sources/google/map.ts) is all it takes to show it.
import type { GoodDirection } from "./bands"
import type { FormatKey } from "./format"

export type ExtraMetric = {
  key: string
  label: string
  /** Shown after the value; minutes use h:mm via `format` instead. */
  unit?: string
  format: FormatKey
  direction: GoodDirection
  /** The screen it belongs to, for the dashboard row's link. */
  href: string
  /** Accrues through the day: today is a gap in trends, not a low bar. */
  partialToday?: boolean
}

export const EXTRA_METRICS = [
  { key: "distance", label: "Distance", unit: "km", format: "decimal2", direction: "up", href: "/strain", partialToday: true },
  { key: "floors", label: "Floors", format: "grouped", direction: "up", href: "/strain", partialToday: true },
  { key: "elevation", label: "Elevation gain", unit: "m", format: "int", direction: "up", href: "/strain", partialToday: true },
  { key: "active_minutes", label: "Active minutes", format: "duration", direction: "up", href: "/strain", partialToday: true },
  { key: "light_minutes", label: "Light activity", format: "duration", direction: "up", href: "/strain", partialToday: true },
  { key: "azm", label: "Active Zone Minutes", format: "duration", direction: "up", href: "/strain", partialToday: true },
  { key: "active_calories", label: "Active calories", unit: "kcal", format: "grouped", direction: "neutral", href: "/strain", partialToday: true },
  { key: "sedentary_minutes", label: "Sedentary time", format: "duration", direction: "down", href: "/strain", partialToday: true },
  { key: "avg_hr", label: "Average heart rate", unit: "bpm", format: "int", direction: "neutral", href: "/strain" },
  { key: "water", label: "Water", unit: "ml", format: "grouped", direction: "up", href: "/journal", partialToday: true },
  { key: "calories_in", label: "Calories eaten", unit: "kcal", format: "grouped", direction: "neutral", href: "/journal", partialToday: true },
  { key: "protein", label: "Protein", unit: "g", format: "int", direction: "neutral", href: "/journal", partialToday: true },
  { key: "carbs", label: "Carbohydrates", unit: "g", format: "int", direction: "neutral", href: "/journal", partialToday: true },
  { key: "fat", label: "Fat", unit: "g", format: "int", direction: "neutral", href: "/journal", partialToday: true },
  { key: "glucose", label: "Blood glucose", unit: "mg/dL", format: "int", direction: "neutral", href: "/health/monitor" },
  { key: "core_temp", label: "Core temperature", unit: "°C", format: "decimal1", direction: "neutral", href: "/health/monitor" },
  { key: "swim_strokes", label: "Swim strokes", format: "grouped", direction: "up", href: "/strain", partialToday: true },
] as const satisfies readonly ExtraMetric[]

export type ExtraKey = (typeof EXTRA_METRICS)[number]["key"]

export const EXTRA_KEYS = EXTRA_METRICS.map((m) => m.key) as ExtraKey[]

export const extraMetric = (key: ExtraKey): ExtraMetric => EXTRA_METRICS.find((m) => m.key === key)!
