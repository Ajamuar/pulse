// The app's own screenshots (docs/screenshots, demo mode with seeded data, framed by site/scripts/shots.mjs).
// Never third-party images.
import type { Shot } from "../data/metrics"

const files = import.meta.glob<{ default: ImageMetadata }>("../../../docs/screenshots/*.png", { eager: true })

const ALT: Record<string, string> = {
  home: "Home: the Sleep, Recovery and Strain dials, the Health and Stress Monitor cards and the day's activities",
  recovery: "Recovery: today's score and its contributors (HRV, resting heart rate, breathing, sleep, skin temperature) against your baselines",
  strain: "Strain: the day's 0-21 Strain, the Strain Target range, heart rate zones and steps",
  sleep: "Sleep: Sleep Performance, with hours against need, consistency, efficiency and restorative sleep",
  health: "Health: Pulse Age and Pace of Aging, with the Health Monitor below",
  "health-monitor": "Health Monitor: last night's vitals against your normal range, heart rhythm and measurements",
  journal: "Journal: the week strip, the Log for water, food, weight and mood, and the evening check-in",
  trends: "Trends: Recovery by day over the past month, with weekly and monthly averages",
  "dashboard-editor": "My Dashboard: choose the metrics on Home and their order",
}

export function shot(s: Shot) {
  const src = files[`../../../docs/screenshots/${s}.png`]?.default
  if (!src) throw new Error(`Missing screenshot docs/screenshots/${s}.png`)
  const [device, ...rest] = s.split("-")
  return { src, alt: `Pulse on a ${device}. ${ALT[rest.join("-")]}` }
}

export function isPhone(s: Shot) {
  return s.startsWith("phone")
}
