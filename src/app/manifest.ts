import type { MetadataRoute } from "next";

// Open to signed-out visitors (src/proxy.ts skips files with an extension), so install works from /login.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulse: recovery, strain and sleep",
    short_name: "Pulse",
    description: "Recovery, strain and sleep from your Fitbit Air.",
    start_url: "/",
    display: "standalone",
    background_color: "#101518",
    // Matches viewport.themeColor (layout.tsx), the top of the page ground, so the installed app's bar never changes colour on load.
    theme_color: "#1d2529",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
