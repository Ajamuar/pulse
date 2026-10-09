import type { APIRoute } from "astro"
import { METRICS, metricPath } from "../data/metrics"
import { COMPARISONS } from "../data/compare"
import { markdownPath } from "../lib/markdown"
import { REPO, SETUP_GUIDE } from "../config"
import { getPosts, postPath } from "../lib/posts"

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPosts()
  const link = (name: string, path: string, summary: string) => `- [${name}](${new URL(path, site).href}): ${summary}`
  const body = [
    "# Pulse",
    "> Open source, self-hosted health scores for Fitbit Air owners using their Google Health API data.",
    "This is the public project site, not a user's private health dashboard. Scores are estimates for wellness, not medical diagnoses. Product comparisons state when outside facts were checked. The optional AI coach uses the provider configured by the user.",
    "## Start here",
    link("Pulse overview", "/index.md", "Features, hosting and privacy."),
    link("Setup guide", SETUP_GUIDE, "Install and configure your instance."),
    link("Glossary", "/glossary/index.md", "Wearable and scoring terms."),
    "## Metrics",
    ...METRICS.map(m => link(m.name, markdownPath(metricPath(m)), m.summary)),
    "## Comparisons",
    ...COMPARISONS.map(c => link(c.h1, markdownPath(`/compare/${c.slug}/`), `Facts checked ${c.checked}.`)),
    "## Blog",
    ...posts.map(p => link(p.data.title, postPath(p.id), p.data.description)),
    "## Optional",
    link("Source code", REPO, "Implementation, tests and license."),
    link("Privacy policy", "/privacy/", "Public website and self-hosted app data handling."),
    link("Terms", "/terms/", "License and use of Pulse."),
  ].join("\n\n") + "\n"
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, follow" } })
}
