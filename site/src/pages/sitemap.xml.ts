import type { APIRoute } from "astro"
import { CONTENT_UPDATED } from "../config"
import { COMPARISONS } from "../data/compare"
import { METRICS, metricPath } from "../data/metrics"

// Every page, generated from the same data as the routes, so a new metric or comparison is listed automatically.
export const GET: APIRoute = ({ site }) => {
  const pages: [string, string][] = [
    ["/", CONTENT_UPDATED],
    ["/metrics/", CONTENT_UPDATED],
    ...METRICS.map((m): [string, string] => [metricPath(m), CONTENT_UPDATED]),
    ["/compare/", CONTENT_UPDATED],
    ...COMPARISONS.map((c): [string, string] => [`/compare/${c.slug}/`, c.checked]),
    ["/glossary/", CONTENT_UPDATED],
  ]
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map(([p, d]) => `  <url><loc>${new URL(p, site).href}</loc><lastmod>${d}</lastmod></url>`).join("\n") +
    "\n</urlset>\n"
  return new Response(body, { headers: { "Content-Type": "application/xml" } })
}
