import { METRICS, metricPath, relatedOf, type Metric } from "../data/metrics"
import { COMPARISONS, type Comparison } from "../data/compare"
import { GLOSSARY } from "../data/glossary"
import { LICENSE_URL, REPO, SETUP_GUIDE } from "../config"

export const markdownPath = (path: string) => `${path}index.md`
const clean = (text: string, site: URL): string => text
  .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/g, (_, href, label) => `[${label}](${new URL(href, site).href})`)
  .replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&")
const link = (name: string, path: string, site: URL) => `[${name}](${new URL(path, site).href})`
const sources = (items: { label: string; url?: string }[], site: URL) => items.map(s => `- ${s.url ? link(s.label, s.url, site) : s.label}`).join("\n")

export function metricMarkdown(m: Metric, site: URL) {
  return [
    `# ${m.name}`, m.summary,
    `Canonical page: ${new URL(metricPath(m), site).href}`,
    ...m.sections.map(s => [
      `## ${s.title}`,
      ...Object.keys(s).flatMap(key => key === "paragraphs" ? s.paragraphs!.map(p => clean(p, site)) : key === "rows" ? s.rows!.map(r => `- **${r.term}:** ${clean(r.detail, site)}`) : []),
    ].join("\n\n")),
    "## Sources", m.sources?.length ? sources(m.sources, site) : "This is Pulse's own model and has no published validation. Read it as a rough guide.",
    ...(m.faq?.length ? ["## Questions", ...m.faq.map(f => `### ${f.q}\n\n${clean(f.a, site)}`)] : []),
    "## Related", relatedOf(m).map(r => `- ${link(r.name, markdownPath(metricPath(r)), site)}`).join("\n"),
  ].join("\n\n") + "\n"
}

export function comparisonMarkdown(c: Comparison, site: URL) {
  return [
    `# ${c.h1}`, `Facts about other products checked: ${c.checked}.`,
    `Canonical page: ${new URL(`/compare/${c.slug}/`, site).href}`, clean(c.answer, site),
    ...c.sections.map(s => [
      `## ${s.h}`, ...(s.p ?? []).map(p => clean(p, site)),
      ...(s.list ? [s.list.map(p => `- ${clean(p, site)}`).join("\n")] : []),
      ...(s.table ? [s.table.caption, `| ${s.table.head.join(" | ")} |\n| ${s.table.head.map(() => "---").join(" | ")} |\n${s.table.rows.map(row => `| ${row.map(cell => clean(cell, site).replace(/\|/g, "\\|")).join(" | ")} |`).join("\n")}`] : []),
    ].join("\n\n")),
    ...(c.faq?.length ? ["## Questions", ...c.faq.map(f => `### ${f.q}\n\n${clean(f.a, site)}`)] : []),
    "## Sources", sources(c.sources, site),
  ].join("\n\n") + "\n"
}

export function overviewMarkdown(site: URL) {
  return [
    "# Pulse", "> Open source, self-hosted health scores for Fitbit Air data from the Google Health API.",
    "Pulse shows Recovery, Strain, Sleep Performance, Pulse Age, Stress, Energy Bank, training insights, journal insights and a configurable AI coach. Its scores are wellness estimates, not medical diagnoses. Missing data is shown honestly; baselines use earlier days only.",
    `Canonical page: ${new URL("/", site).href}`,
    "## Run Pulse", `- ${link("Setup guide", SETUP_GUIDE, site)}\n- ${link("Source code", REPO, site)}\n- ${link("PolyForm Noncommercial 1.0.0 license", LICENSE_URL, site)}`,
    "Your health data is stored in your own Postgres database. Google access requires your own OAuth client. The optional coach sends the context needed to answer to the AI provider you configure.",
    "## Scores", METRICS.map(m => `- ${link(m.name, markdownPath(metricPath(m)), site)}: ${m.summary}`).join("\n"),
    "## Compare", COMPARISONS.map(c => `- ${link(c.h1, markdownPath(`/compare/${c.slug}/`), site)}: ${c.description}`).join("\n"),
  ].join("\n\n") + "\n"
}

export function glossaryMarkdown(site: URL) {
  return ["# Pulse glossary", `Canonical page: ${new URL("/glossary/", site).href}`, ...[...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term)).map(t => `## ${t.term}\n\n${t.definition}`)].join("\n\n") + "\n"
}

export function markdownResponse(body: string, canonical: string, site: URL) {
  return new Response(body, { headers: {
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Robots-Tag": "noindex, follow",
    Link: `<${new URL(canonical, site).href}>; rel="canonical", <${new URL("/llms.txt", site).href}>; rel="describedby"`,
  } })
}
