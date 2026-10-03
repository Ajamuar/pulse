// schema.org JSON-LD builders. Base.astro wraps a page's list in one @graph.
import type { Faq } from "../data/metrics"
import { LICENSE_URL, REPO, SITE_NAME } from "../config"

const strip = (html: string) => html.replace(/<[^>]+>/g, "")
const abs = (path: string, site: URL) => new URL(path, site).href

export function breadcrumbs(site: URL, items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path, site) })),
  }
}

export function faqPage(items: Faq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: strip(f.a) } })),
  }
}

export function softwareApp(site: URL, description: string) {
  return {
    "@type": "SoftwareApplication",
    "@id": abs("/#app", site),
    name: SITE_NAME,
    description,
    url: abs("/", site),
    applicationCategory: "HealthApplication",
    operatingSystem: "Linux, macOS, Windows (Docker)",
    softwareRequirements: "Docker, a Google account with Fitbit Air data in Google Health",
    license: LICENSE_URL,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    sameAs: [REPO],
    screenshot: abs("/og.png", site),
  }
}

export function article(site: URL, o: { type: "TechArticle" | "Article"; path: string; headline: string; description: string; modified: string }) {
  return {
    "@type": o.type,
    headline: o.headline,
    description: o.description,
    url: abs(o.path, site),
    mainEntityOfPage: abs(o.path, site),
    dateModified: o.modified,
    inLanguage: "en",
    author: { "@type": "Organization", name: "Pulse contributors", url: REPO },
    publisher: { "@type": "Organization", name: SITE_NAME, url: abs("/", site) },
    about: { "@id": abs("/#app", site) },
    image: abs("/og.png", site),
  }
}
