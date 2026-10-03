import { defineConfig } from "astro/config"

// The public URL the site is served from: canonical links, the sitemap and OG tags use it. SITE_URL in the build
// environment overrides it (a preview deployment, a fork). Not the app's hostname: the app is private, one owner each.
const SITE_URL = process.env.SITE_URL ?? "https://pulse.portlabs.in"

export default defineConfig({
  site: SITE_URL,
  trailingSlash: "always",
  // Every processed image is an app screenshot: small UI text on flat colour. Sharp's defaults (AVIF quality 50 with
  // 4:2:0 chroma, WebP 80) smear that text and fringe coloured numbers, so encode for text instead.
  image: {
    service: {
      entrypoint: "astro/assets/services/sharp",
      config: { avif: { quality: 72, chromaSubsampling: "4:4:4" }, webp: { quality: 90, smartSubsample: true } },
    },
  },
  // Screenshots and the scoring explainers are read from the repo (docs/, src/), one level up.
  vite: { server: { fs: { allow: [".."] } } },
})
