// Site-wide constants. SITE_URL itself is set in astro.config.mjs (Astro.site).
export const REPO = "https://github.com/adityaongit/pulse"
export const SETUP_GUIDE = `${REPO}/blob/main/docs/setup.md`
export const LICENSE_URL = `${REPO}/blob/main/LICENSE`
export const ALGORITHMS_DIR = `${REPO}/tree/main/docs/algorithms`

export const SITE_NAME = "Pulse"

// Umami (self-hosted). Both must be set at build time for the script tag to render; otherwise no analytics.
// PUBLIC_UMAMI_SRC: the script URL, e.g. https://<your-umami-host>/script.js
// PUBLIC_UMAMI_WEBSITE_ID: the website id from Umami's settings.
export const UMAMI = {
  src: import.meta.env.PUBLIC_UMAMI_SRC as string | undefined,
  websiteId: import.meta.env.PUBLIC_UMAMI_WEBSITE_ID as string | undefined,
}

// dateModified for the article pages. Bump it when the explainer content changes.
export const CONTENT_UPDATED = "2026-10-03"
