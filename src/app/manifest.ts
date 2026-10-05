import type { MetadataRoute } from "next";

const shot = (name: string, sizes: string, form_factor: "narrow" | "wide", label: string) => ({
  src: `/screenshots/${name}.webp`,
  sizes,
  type: "image/webp",
  form_factor,
  label,
});

// Open to signed-out visitors (src/proxy.ts skips files with an extension), so install works from /login.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pulse: recovery, strain and sleep",
    short_name: "Pulse",
    description: "Recovery, strain and sleep from your Fitbit Air.",
    lang: "en",
    categories: ["health", "fitness", "lifestyle"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // A second launch (a shortcut, a notification) reuses the open window instead of stacking another.
    launch_handler: { client_mode: "navigate-existing" },
    // The launch screen on Android is this colour with the "any" icon centred, so the two must match.
    background_color: "#101518",
    // Matches viewport.themeColor (layout.tsx), the top of the page ground, so the installed app's bar never changes colour on load.
    theme_color: "#1d2529",
    icons: [
      // "any" is a small mark on the splash colour (it is also Android's launch screen); "maskable" keeps the mark in the 80% safe zone.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Check in", short_name: "Check in", url: "/journal?checkin=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Recovery", url: "/recovery", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Sleep", url: "/sleep", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
    screenshots: [
      shot("phone-home", "720x1309", "narrow", "Home: recovery, strain and sleep"),
      shot("phone-recovery", "720x1332", "narrow", "Recovery"),
      shot("phone-sleep", "720x1391", "narrow", "Sleep"),
      shot("laptop-home", "1600x1074", "wide", "Home on a laptop"),
    ],
  };
}
