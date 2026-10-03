// The app's own screenshots (docs/screenshots, demo mode with seeded data). Never third-party images.
import desktopHealth from "../../../docs/screenshots/desktop-health.png"
import desktopStrain from "../../../docs/screenshots/desktop-strain.png"
import mobileHealthspan from "../../../docs/screenshots/mobile-healthspan.png"
import mobileHome from "../../../docs/screenshots/mobile-home.png"
import mobileSleep from "../../../docs/screenshots/mobile-sleep.png"
import type { Shot } from "../data/metrics"

export const SHOTS = {
  "mobile-home": { src: mobileHome, alt: "Pulse on a phone: sleep, recovery and strain dials, with the Health and Stress Monitor cards below" },
  "mobile-sleep": { src: mobileSleep, alt: "Pulse on a phone: the Sleep Performance screen" },
  "mobile-healthspan": { src: mobileHealthspan, alt: "Pulse on a phone: the Healthspan screen with Pulse Age and Pace of Aging" },
  "desktop-strain": { src: desktopStrain, alt: "Pulse on a laptop: the Strain screen with the Strain dial, Strain Target and a day of heart rate" },
  "desktop-health": { src: desktopHealth, alt: "Pulse on a laptop: the Health screen with Pulse Age, the Health Monitor, the Stress Monitor and Fitness" },
} satisfies Record<Shot, { src: ImageMetadata; alt: string }>

export function isPhone(s: Shot) {
  return s.startsWith("mobile")
}
