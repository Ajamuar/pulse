// Retakes the app screenshots in docs/screenshots/ from a running demo-mode app, framed with margin:
//   GOOGLE_OAUTH_ENABLED=false TZ=Asia/Kolkata pnpm dev -p 3317   (repo root, in another terminal)
//   pnpm shots                                                    (in site/; APP_URL overrides the address)
// Needs the repo root's `pnpm install` (Playwright). Phone: 390 wide at 3x in a device frame, cut on a clean row or
// card boundary (see cleanCut). Laptop: 1440 x 900 at 2x in a window frame. Both on a transparent margin, so they sit
// on any background (README, site). Written as lossless PNG: palette quantising smears small UI text.
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const require = createRequire(new URL("../../package.json", import.meta.url))
const { chromium } = require("@playwright/test")

const APP = process.env.APP_URL ?? "http://localhost:3317"
const OUT = (name) => fileURLToPath(new URL(`../../docs/screenshots/${name}.png`, import.meta.url))

const SCREENS = [
  ["home", "/"],
  ["recovery", "/recovery"],
  ["strain", "/strain"],
  ["sleep", "/sleep"],
  ["health", "/health"],
  // On the phone, scroll to Heart rhythm and Measurements, the newer half of the screen. What scrolled up under the
  // header is hidden, so no half-row shows through it.
  ["health-monitor", "/health/monitor", (page, kind) => kind === "phone" &&
    page.getByRole("heading", { name: "Heart rhythm" }).evaluate((h) => {
      scrollBy(0, h.getBoundingClientRect().top - 96) // just under the header, so the Measurements card fits below
      const top = h.getBoundingClientRect().top
      hideWhere((r) => r.bottom <= top)
    })],
  ["journal", "/journal"],
  ["trends", "/trends"],
  ["dashboard-editor", "/", (page) => page.getByRole("button", { name: "Edit My Dashboard" }).click()],
]

// The phone's status bar is drawn by the frame, so the page gets the rest of an 844 pt screen.
const STATUS = 50
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 - STATUS }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
}

// Hides the scrolling content (not the fixed or sticky header and bars) whose box matches `test`. Exposed to the page.
const HIDE = `window.hideWhere = (test) => {
  const pinned = (e) => { for (; e; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) return true }
  for (const e of document.querySelectorAll("main *")) {
    const r = e.getBoundingClientRect()
    if (r.height && test(r) && !pinned(e)) e.style.visibility = "hidden"
  }
}`

// The phone's round check-in button floats over the bottom right of every screen (src/components/shells/AppNav.tsx).
const FLOAT_CSS = `a[aria-label^="Check in for"] { display: none !important; }`

// Runs in the page. Picks the screen height so the capture ends on a row or card boundary rather than mid-row: the
// lowest y that no row, chip, line of text or icon crosses. Containers taller than a few rows (a card of rows) may be
// cut between their rows. Everything below the cut is hidden, so the screen ends on a gap of background (or of the
// card being cut), and on tab roots the floating tab bar shows no half-row through its glass.
function cleanCut({ maxH, minH }) {
  // A sheet (the dashboard editor) fills the screen and ends on its own buttons.
  if (document.querySelector("[role=dialog]")) return maxH
  const ROW = 240
  const bar = [...document.querySelectorAll("body *")]
    .filter((e) => getComputedStyle(e).position === "fixed" && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().bottom > maxH - 120)
    .reduce((top, e) => Math.min(top, e.getBoundingClientRect().top), maxH)
  const inset = maxH - bar // space the bottom bar takes, 0 without one
  const boxes = [] // what a cut must not cross
  const ends = new Set() // where a cut may fall: the bottom of any row, card or line
  const solid = (c) => !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor) || c.backgroundImage !== "none" || c.boxShadow !== "none" || parseFloat(c.borderTopWidth) + parseFloat(c.borderBottomWidth) > 0
  for (const e of document.querySelectorAll("main *")) {
    const c = getComputedStyle(e)
    if (c.visibility === "hidden" || c.display === "none" || c.position === "fixed" || c.position === "sticky") continue
    const r = e.getBoundingClientRect()
    if (!r.height || !r.width) continue
    const ink = /^(svg|img|canvas|video|input|button)$/i.test(e.tagName)
    if (ink || solid(c)) ends.add(Math.ceil(r.bottom))
    // A row: a short box with a background or divider, or a short group of several parts (label, bar, caption).
    if (ink || (r.height <= ROW && (solid(c) || e.children.length > 1))) boxes.push([r.top, r.bottom])
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const t of range.getClientRects()) boxes.push([t.top, t.bottom]), ends.add(Math.ceil(t.bottom))
    }
  }
  const crosses = (y) => boxes.some(([t, b]) => t < y - 0.5 && b > y + 0.5)
  // Below the cut: a gap of plain background, enough to clear the rounded corners of the screen, or the bar.
  const gap = inset ? 16 : 28
  const cut = [...ends].sort((a, b) => b - a).find((y) => y >= minH - inset - gap && y + gap + inset <= maxH && !crosses(y))
  if (!cut) throw new Error(`No clean cut on ${location.pathname}`)
  hideWhere((r) => r.top >= cut)
  return cut + gap + inset
}

mkdirSync(fileURLToPath(new URL("../../docs/screenshots/", import.meta.url)), { recursive: true })
const res = await fetch(`${APP}/login/demo`, { method: "POST", redirect: "manual" })
const token = /pulse_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1]
if (!token) throw new Error(`No demo session from ${APP}/login/demo: is the app running in demo mode?`)

const browser = await chromium.launch()
for (const [kind, opts] of Object.entries(DEVICES)) {
  const ctx = await browser.newContext({ ...opts, timezoneId: "Asia/Kolkata", reducedMotion: "reduce", colorScheme: "dark" })
  await ctx.addCookies([{ name: "pulse_session", value: token, url: APP }])
  const page = await ctx.newPage()
  for (const [name, path, act] of SCREENS) {
    await page.setViewportSize(opts.viewport)
    await page.goto(APP + path, { waitUntil: "networkidle" })
    await page.evaluate(HIDE)
    // Not part of the screen: the dev-mode indicator, and on the phone the floating check-in button over the content.
    await page.addStyleTag({ content: `nextjs-portal { display: none !important; }${kind === "phone" ? FLOAT_CSS : ""}` })
    if (act) await act(page, kind)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(600)
    let height = opts.viewport.height
    if (kind === "phone") {
      height = await page.evaluate(cleanCut, { maxH: height, minH: 600 })
      await page.setViewportSize({ width: opts.viewport.width, height })
      await page.waitForTimeout(300)
    }
    const raw = await page.screenshot({ type: "png" })
    await frame(kind, raw, opts.deviceScaleFactor, height, OUT(`${kind}-${name}`))
    console.log(`wrote docs/screenshots/${kind}-${name}.png`)
  }
  await ctx.close()
}
await browser.close()

// Draws the raw capture inside a device or window frame on a transparent margin, then writes a compact PNG.
async function frame(kind, png, scale, height, out) {
  const { width } = DEVICES[kind].viewport
  const src = `data:image/png;base64,${png.toString("base64")}`
  const phone = kind === "phone"
  const html = `<!doctype html><html><head><style>
* { box-sizing: border-box; margin: 0; }
html, body { background: transparent; }
body { padding: ${phone ? 28 : 40}px; width: max-content; font: 600 15px/1 -apple-system, system-ui, sans-serif; color: #fff; }
.device { padding: 10px; border-radius: 62px; background: linear-gradient(160deg, #3a4146, #1d2125 40%, #2a3035);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / .14), 0 24px 48px -12px rgb(0 0 0 / .55); }
.screen { overflow: hidden; border-radius: 52px; background: #262e33; }
.status { position: relative; display: flex; align-items: center; justify-content: space-between; height: ${STATUS}px; padding: 6px 30px 0 44px; }
.island { position: absolute; left: 50%; top: 11px; width: 120px; height: 34px; translate: -50% 0; border-radius: 20px; background: #000; }
.icons { display: flex; gap: 6px; align-items: center; }
.window { overflow: hidden; border-radius: 14px; background: #1b2024;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / .1), 0 30px 60px -16px rgb(0 0 0 / .6); }
.bar { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; background: #22292e; box-shadow: inset 0 -1px 0 rgb(255 255 255 / .06); }
.bar i { width: 12px; height: 12px; border-radius: 50%; background: rgb(255 255 255 / .16); }
img { display: block; width: ${width}px; height: ${height}px; }
</style></head><body>${
    phone
      ? `<div class="device"><div class="screen"><div class="status"><span>9:41</span><span class="island"></span><span class="icons">
<svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#fff" stroke-opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2" fill="#fff"/><rect x="25" y="4.5" width="1.5" height="4" rx=".75" fill="#fff" fill-opacity=".4"/></svg>
</span></div><img src="${src}"></div></div>`
      : `<div class="window"><div class="bar"><i></i><i></i><i></i></div><img src="${src}"></div>`
  }</body></html>`
  const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 1600, height: 1000 } })
  await page.setContent(html)
  const shot = await page.locator("body").screenshot({ omitBackground: true, type: "png" })
  await page.close()
  // Lossless: a palette PNG is a third of the size but dithers the antialiasing of small UI text, which then reads as
  // blur once the site downscales it. The site serves AVIF and WebP made from this file.
  await sharp(shot).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(out)
}
