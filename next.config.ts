import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Client cache for visited pages (Next 16 keeps dynamic pages for 0 s by default, so every tab switch re-rendered
  // on the server behind a skeleton). A sync's router.refresh() clears it, so data is never older than the last sync.
  experimental: { staleTimes: { dynamic: 60, static: 300 } },
  // Lets another device on the LAN load the dev server (next dev only): DEV_ORIGINS=192.168.1.10,my-mac.local
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  // A second `next dev` (the e2e server) needs its own build dir: Next locks one dev server per dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
