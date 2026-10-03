// Comparison and question pages under /compare/<slug>/. Facts about other products are dated and sourced
// (see docs/research/landing-and-seo.md), name them in plain text only, and say where they are the better pick.
// Re-check every claim about another product on each content update and bump `checked`.
import type { Faq, Source } from "./metrics"

export type Table = { head: string[]; rows: string[][]; caption: string }
export type Section = { h: string; p?: string[]; list?: string[]; table?: Table }
export type Comparison = {
  slug: string
  /** Short label for links and the footer. */
  nav: string
  title: string
  h1: string
  description: string
  /** The direct answer, first thing on the page (under about 60 words). HTML allowed. */
  answer: string
  sections: Section[]
  faq?: Faq[]
  sources: Source[]
  /** The date the third-party facts were last checked. */
  checked: string
}

const SRC = {
  googleBlog: { label: "Google: Fitbit Air and the Google Health app (launch post, 2026-05-07)", url: "https://blog.google/products-and-platforms/products/google-health/google-health-fitbit/" },
  googleIndia: { label: "Google India: Fitbit Air comes to India (2026)", url: "https://blog.google/intl/en-in/products/hardware/the-all-new-fitbit-air-comes-to-india/" },
  premiumPrice: { label: "Android Authority: Google Health Premium price and features", url: "https://www.androidauthority.com/google-health-premium-price-inclusions-features-3664507/" },
  dtFree: { label: "Digital Trends: Fitbit Air's core features don't need a subscription", url: "#" },
  kygo: { label: "Kygo: Fitbit Air vs the reference app (updated 2026-09-18)", url: "#" },
  fiveK: { label: "the5krunner: Fitbit Air review and buyer's guide (2026-05-07)", url: "https://the5krunner.com/2026/05/07/fitbit-air-opinion-review-buyers-guide/" },
  refRecovery: { label: "the reference app support: How is Recovery calculated?", url: "#" },
  refStrain: { label: "the reference app: How does the reference app Strain work?", url: "#" },
  pulseAge: { label: "the reference app support: Healthspan, Pulse Age and Pace of Aging guide", url: "#" },
  oauthCap: { label: "Google Cloud help: unverified apps and the 100-user cap", url: "https://support.google.com/cloud/answer/7454865?hl=en" },
  noop: { label: "noop on GitHub", url: "https://github.com/ryanbr/noop" },
  haelan: { label: "Hælan on GitHub", url: "https://github.com/bardesss/haelan" },
  fitbitGrafana: { label: "fitbit-grafana on GitHub", url: "https://github.com/arpanghosh8453/fitbit-grafana" },
  takeout: { label: "Google Health Help: export your data", url: "https://support.google.com/googlehealth/answer/14236615?hl=en" },
}

const CHECKED = "2026-10-03"

export const COMPARISONS: Comparison[] = [
  {
    slug: "fitbit-air-recovery-and-strain",
    nav: "Fitbit Air recovery and strain",
    title: "Does the Fitbit Air have strain and recovery scores?",
    h1: "Does the Fitbit Air have strain and recovery scores?",
    description: "The Google Health app gives Fitbit Air owners Readiness and Cardio Load, not a 0-100% Recovery or a 0-21 Strain. How to get both, free and self-hosted.",
    answer:
      "Not in that form. The Google Health app gives Fitbit Air owners a Daily Readiness score and Cardio Load, but no 0-100% morning Recovery and no 0-21 daily Strain. Pulse computes both, with Sleep Performance, Pulse Age, Stress and Energy Bank, from the band's own data on a server you run.",
    sections: [
      {
        h: "What the Google Health app gives you",
        p: [
          "The Fitbit Air is Google's screenless band, announced in May 2026 at $99 in the US. Reviews list heart rate, HRV, SpO2, skin temperature, sleep stages, Cardio Load and Daily Readiness among the features that need no subscription. Google Health Premium adds the Gemini-based Google Health Coach, adaptive plans and deeper sleep insights.",
          "Reviewers who compared the Air with the reference app describe its recovery scoring as simpler, with no 0-21 daily strain scale.",
        ],
      },
      {
        h: "What Pulse adds",
        list: [
          '<a href="/metrics/recovery/">Recovery</a>, 0-100% each morning from HRV, resting heart rate, sleep, respiratory rate and skin temperature against your own baselines.',
          '<a href="/metrics/strain/">Strain</a> on a 0-21 scale, and a <a href="/metrics/strain-target/">Strain Target</a> range for today set by your Recovery.',
          '<a href="/metrics/sleep-performance/">Sleep Performance</a> against your personal sleep need, and a <a href="/metrics/sleep-planner/">Sleep Planner</a> bedtime.',
          '<a href="/metrics/pulse-age/">Pulse Age</a>, <a href="/metrics/stress-monitor/">Stress</a>, <a href="/metrics/energy-bank/">Energy Bank</a> and a nightly <a href="/metrics/health-monitor/">Health Monitor</a>.',
        ],
      },
      {
        h: "How Pulse gets the data",
        p: [
          "The band syncs to the Google Health app as usual. Pulse reads it from there through the Google Health API, with an OAuth client you create in your own Google Cloud project, and stores it in SQLite on your server. Your Google Health data is not copied anywhere else.",
          "Google caps an unverified OAuth app at 100 users, so a shared hosted version is not practical. One instance serves one person, which is also the privacy model.",
        ],
      },
      {
        h: "What it does not change",
        p: [
          "Pulse works with what the band records. If the Air misses a night's sleep stages, there is no HRV for that night and Pulse shows no Recovery rather than a guess. Its scores use the same scales as the reference app's but a different method and sensor, so the numbers are not interchangeable.",
        ],
      },
    ],
    faq: [
      { q: "Do I need Google Health Premium for Pulse?", a: "No. Pulse reads the data the band records, which does not need Premium. Premium adds Google's own coaching features inside the Google Health app." },
      { q: "Does Pulse work on iPhone?", a: "Yes. Pulse is a web app: open your server's address in Safari or any browser and add it to the home screen. The band still pairs with the Google Health app on your phone." },
    ],
    sources: [SRC.googleBlog, SRC.dtFree, SRC.kygo, SRC.fiveK, SRC.premiumPrice, SRC.oauthCap],
    checked: CHECKED,
  },
  {
    slug: "pulse-vs-refapp",
    nav: "Pulse and the reference app",
    title: "Pulse and the reference app compared: scores, cost and data",
    h1: "Pulse and the reference app, compared",
    description: "A factual comparison of Pulse on a Fitbit Air with a the reference app membership: which scores each has, how they are paid for, where the data lives, and who each suits.",
    answer:
      "the reference app is a band, an app and a membership in one product. Pulse is free, open-source software that computes similar scores (Recovery, Strain, Sleep Performance, a biological-age estimate) from a Fitbit Air you already own, on a server you run. The reference app works out of the box and comes with support; Pulse is for people who want no subscription and their data on their own machine.",
    sections: [
      {
        h: "Side by side",
        table: {
          caption: `Checked ${CHECKED}. Prices are as reported by the sources below and change often.`,
          head: ["", "the reference app", "Pulse on a Fitbit Air"],
          rows: [
            ["Hardware", "the reference app's own band, included with the membership", "Fitbit Air, bought once ($99 in the US at launch)"],
            ["How you pay", "Annual membership; reported tiers from $199 a year", "Pulse is free for noncommercial use. You run it on your own computer or server"],
            ["Recovery", "0-100%, green, yellow and red bands", "0-100%, the same bands; method published"],
            ["Strain", "0-21 scale", "0-21 scale; method published"],
            ["Sleep", "Sleep performance, sleep planner", "Sleep Performance, Sleep Planner, sleep consistency (SRI)"],
            ["Biological age", "Pulse Age and Pace of Aging", "Pulse Age and Pace of Aging, from cited studies"],
            ["Method", "Proprietary; weights not published", "Open source, with formulas, constants and citations"],
            ["Where your data lives", "the reference app's cloud", "Your server (SQLite); the band's data also stays in Google Health"],
            ["Apps", "iOS and Android apps", "A web app you install from the browser"],
            ["Coaching and support", "AI coach, company support", "No coach; GitHub issues and the docs"],
          ],
        },
      },
      {
        h: "Where the reference app is the better choice",
        list: [
          "You want one product that works out of the box, with support behind it.",
          "You want a band whose sensors and sampling were designed for its own scores.",
          "You want native phone apps, coaching and features Pulse does not have.",
          "You do not want to run a server, create a Google Cloud project or update Docker images.",
        ],
      },
      {
        h: "Where Pulse fits",
        list: [
          "You already own a Fitbit Air, or prefer its price, and want recovery and strain scores without a second subscription.",
          "You want your health data on a machine you control, with nothing sent to a Pulse service (there is none).",
          "You want to read exactly how every number is made, and check it against the code.",
        ],
      },
      {
        h: "The numbers are not interchangeable",
        p: [
          "Pulse uses the reference app's familiar scales so the numbers read naturally, but its method is its own, ported from the open-source noop project and published. A 70% Recovery in Pulse and a 70% Recovery in the reference app come from different sensors and different maths. Compare yourself with yourself.",
        ],
      },
    ],
    sources: [SRC.kygo, SRC.googleBlog, SRC.refRecovery, SRC.refStrain, SRC.pulseAge, SRC.noop],
    checked: CHECKED,
  },
  {
    slug: "refapp-alternative-without-subscription",
    nav: "Without a subscription",
    title: "Recovery and strain tracking without a subscription",
    h1: "Recovery and strain tracking without a subscription",
    description: "Open-source and subscription-free ways to get recovery, strain and sleep scores: Pulse for the Fitbit Air, noop for the reference app straps, Hælan and fitbit-grafana.",
    answer:
      "If you want recovery and strain scores with no monthly fee, the cheapest route is a band without a required subscription plus software that computes the scores. Pulse does this for the Fitbit Air, self-hosted and free for noncommercial use. Other open-source projects cover nearby needs.",
    sections: [
      {
        h: "What it costs to run Pulse",
        list: [
          "A Fitbit Air, bought once. Its core features need no subscription.",
          "A computer that can run Docker: a home server, a NAS, a small cloud VM or a laptop. Pulse uses about 100-150 MB of memory.",
          "A one-time setup: a Google Cloud OAuth client, the container, and HTTPS if you want it on your phone. The setup guide walks through each step.",
          "Your time to keep it updated and backed up.",
        ],
      },
      {
        h: "Open-source projects in the same space",
        table: {
          caption: `Checked ${CHECKED}. Descriptions are from each project's own README.`,
          head: ["Project", "Works with", "What it gives you", "License"],
          rows: [
            ["Pulse", "Fitbit Air (Google Health API)", "Recovery, Strain, sleep scores, Pulse Age, Stress, Energy Bank, journal insights", "PolyForm Noncommercial 1.0.0"],
            ['<a href="https://github.com/ryanbr/noop">noop</a>', "the reference app straps", "An offline companion app with recovery, strain and sleep scoring; Pulse's scoring is ported from it", "PolyForm Noncommercial 1.0.0"],
            ['<a href="https://github.com/bardesss/haelan">Hælan</a>', "Google Health", "A self-hosted mirror of your Google Health data, with a dashboard and tools", "AGPL-3.0"],
            ['<a href="https://github.com/arpanghosh8453/fitbit-grafana">fitbit-grafana</a>', "Fitbit / Google Health", "Raw metrics in InfluxDB and Grafana charts", "BSD-4-Clause"],
          ],
        },
      },
      {
        h: "Choosing between them",
        p: [
          "If you own a the reference app strap and want to stop paying for the membership, noop is built for that. If you own a Fitbit Air and want computed scores rather than raw charts, Pulse is. If you mostly want your Google Health data mirrored and searchable, look at Hælan or fitbit-grafana. They can run side by side.",
        ],
      },
    ],
    faq: [
      { q: "Is Pulse really free?", a: "Yes, for personal and other noncommercial use under the PolyForm Noncommercial 1.0.0 license. Selling it, or putting it inside a commercial product, is not allowed. You pay only for the band and whatever machine you run it on." },
      { q: "Why is there no hosted version?", a: "Google limits an unverified app to 100 users, and a hosted service would hold everyone's health data. Self-hosting keeps each person's data on their own machine." },
    ],
    sources: [SRC.googleBlog, SRC.dtFree, SRC.noop, SRC.haelan, SRC.fitbitGrafana, SRC.oauthCap],
    checked: CHECKED,
  },
  {
    slug: "google-health-premium",
    nav: "Google Health Premium",
    title: "Google Health Premium vs free vs Pulse for Fitbit Air",
    h1: "What Google Health Premium adds, and what Pulse adds",
    description: "What a Fitbit Air does free, what Google Health Premium adds, and what Pulse computes on top, so you can decide what you need.",
    answer:
      "They do different jobs. Google Health Premium adds coaching and deeper insights inside the Google Health app. Pulse adds a separate set of scores (Recovery, Strain, Sleep Performance, Pulse Age, Energy Bank) computed from the same data on your own server. You can use either, both or neither.",
    sections: [
      {
        h: "Three layers",
        table: {
          caption: `Checked ${CHECKED}. Feature lists are as reported by the sources below.`,
          head: ["", "What you get", "Cost"],
          rows: [
            ["Fitbit Air, free tier", "Heart rate, HRV, SpO2, skin temperature, sleep stages, Cardio Load, Daily Readiness", "The band (3 months of Premium included)"],
            ["Google Health Premium", "Google Health Coach (Gemini), adaptive plans, deeper sleep insights", "Reported at $9.99 a month or $99.99 a year in the US"],
            ["Pulse", "Recovery, Strain and Strain Target, Sleep Performance and Planner, Pulse Age, Stress, Energy Bank, Health Monitor, journal insights", "Free for noncommercial use; you run it"],
          ],
        },
      },
      {
        h: "When Premium is worth it",
        p: ["If you want guided plans and a coach you can ask questions, inside the app the band already uses, Premium is the simpler choice. Pulse has no coach."],
      },
      {
        h: "When Pulse is worth it",
        p: [
          "If you want daily recovery and strain numbers with a published method, a long history you keep on your own machine, and are comfortable with Docker, Pulse fills that gap without a subscription.",
        ],
      },
    ],
    sources: [SRC.googleBlog, SRC.premiumPrice, SRC.dtFree, SRC.googleIndia],
    checked: CHECKED,
  },
]
