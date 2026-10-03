import { defineConfig } from "astro/config"

// The public URL the site is served from: canonical links, the sitemap and OG tags use it.
// TODO(owner): set SITE_URL in the host's build settings once the domain is chosen. Not the app's own
// hostname: the app is private, one owner per instance. The placeholder keeps builds working.
const SITE_URL = process.env.SITE_URL ?? "https://pulse.example.com"

export default defineConfig({
  site: SITE_URL,
  trailingSlash: "always",
  // Screenshots and the scoring explainers are read from the repo (docs/, src/), one level up.
  vite: { server: { fs: { allow: [".."] } } },
})
