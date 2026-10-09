// Hand-drawn diagrams for blog posts, drawn at build time with roughjs (the library behind Excalidraw's look).
// A post writes a fenced block with the language `sketch` and a JSON spec; sketchPlugin swaps it for a figure of
// two inline SVGs, a wide layout and a narrow one, and CSS shows the one that fits. No script ships.
// Kinds: bands, bars, flow, steps, line, compare. Spec reference: docs/blog-diagrams.md.
import rough from "roughjs"

// Colours are the site's tokens, so a diagram follows the theme.
const TONES = {
  green: "var(--recovery-green)",
  yellow: "var(--recovery-yellow)",
  red: "var(--recovery-red-text)",
  blue: "var(--strain-text)",
  sleep: "var(--sleep)",
  teal: "var(--optimal)",
  orange: "var(--warning)",
  grey: "var(--muted-foreground)",
}
const INK = "var(--foreground-secondary)"
const STRONG = "var(--foreground)"
const MUTED = "var(--muted-foreground)"
const tone = (t, where) => {
  if (t === undefined) return INK
  if (!(t in TONES)) throw new Error(`${where}: unknown tone "${t}". Use one of: ${Object.keys(TONES).join(", ")}`)
  return TONES[t]
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// Caveat is narrow: about 0.42 em per character on average.
const charW = (size) => size * 0.42
function wrap(text, size, width) {
  const max = Math.max(4, Math.floor(width / charW(size)))
  const lines = []
  let line = ""
  for (const word of String(text).split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line)
      line = word
    } else line = line ? line + " " + word : word
  }
  if (line) lines.push(line)
  return lines
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) % 2 ** 31 || 1
}

// Wide: 720 units across, shown at up to 820 px. Narrow: 400 units, for a phone column, with larger relative text.
const LAYOUTS = {
  wide: { W: 720, F: 28, S: 23, narrow: false },
  narrow: { W: 400, F: 25, S: 21, narrow: true },
}

class Canvas {
  constructor(seed, layout) {
    Object.assign(this, layout)
    this.g = rough.generator()
    this.seed = seed
    this.parts = []
  }
  opts(o) {
    return { roughness: 1.1, bowing: 1, strokeWidth: 2, stroke: INK, seed: this.seed++, ...o }
  }
  draw(d) {
    for (const p of this.g.toPaths(d)) {
      this.parts.push(`<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? "none"}" stroke-linecap="round" stroke-linejoin="round"/>`)
    }
  }
  rect(x, y, w, h, o = {}) {
    this.draw(this.g.rectangle(x, y, w, h, this.opts(o)))
  }
  line(x1, y1, x2, y2, o = {}) {
    this.draw(this.g.line(x1, y1, x2, y2, this.opts(o)))
  }
  curve(points, o = {}) {
    this.draw(this.g.curve(points, this.opts(o)))
  }
  circle(x, y, d, o = {}) {
    this.draw(this.g.circle(x, y, d, this.opts(o)))
  }
  arrow(x1, y1, x2, y2, o = {}) {
    this.line(x1, y1, x2, y2, o)
    const a = Math.atan2(y2 - y1, x2 - x1)
    for (const s of [-1, 1]) {
      const b = a + Math.PI + s * 0.45
      this.line(x2, y2, x2 + 13 * Math.cos(b), y2 + 13 * Math.sin(b), o)
    }
  }
  // Text, wrapped to `width` when given. `y` is the first baseline. Returns the height used.
  text(x, y, str, { size = this.F, fill = INK, anchor = "start", width } = {}) {
    const lines = width ? wrap(str, size, width) : [String(str)]
    const lh = size * 1.05
    lines.forEach((l, i) => {
      this.parts.push(`<text x="${x}" y="${y + i * lh}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`)
    })
    return lines.length * lh
  }
  svg(h, label, cls) {
    return `<svg class="${cls}" viewBox="0 0 ${this.W} ${Math.ceil(h)}" role="img" aria-label="${esc(label)}">${this.parts.join("")}</svg>`
  }
}

const KINDS = {
  // A scale split into coloured bands, with optional markers. {min, max, unit?, bands: [{to, label, tone}], markers?: [{at, label}]}
  bands(s, c) {
    const L = 24, R = c.W - 24, span = s.max - s.min
    const x = (v) => L + ((v - s.min) / span) * (R - L)
    const top = s.markers?.length ? 92 : 24
    let from = s.min
    let labelH = 0
    for (const b of s.bands) {
      const t = tone(b.tone, "bands")
      c.rect(x(from), top, x(b.to) - x(from), 46, { fill: t, fillStyle: "hachure", hachureGap: 7, fillWeight: 1.6, stroke: t })
      labelH = Math.max(labelH, c.text((x(from) + x(b.to)) / 2, top + 80, b.label, { anchor: "middle", fill: t, width: Math.max(56, x(b.to) - x(from) - 4), size: c.S }))
      from = b.to
    }
    const tickY = top + 80 + labelH + 14
    ;[s.min, ...s.bands.map((b) => b.to)].forEach((v, i, arr) =>
      c.text(x(v), tickY, `${v}${s.unit ?? ""}`, { anchor: i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle", size: c.S - 2, fill: MUTED }),
    )
    for (const m of s.markers ?? []) {
      c.arrow(x(m.at), top - 46, x(m.at), top - 6, { strokeWidth: 2.4, stroke: STRONG })
      const half = (String(m.label).length * charW(c.F)) / 2 + 6
      c.text(Math.min(Math.max(x(m.at), half), c.W - half), top - 56, m.label, { anchor: "middle", fill: STRONG })
    }
    return tickY + 16
  },

  // Horizontal bars. {unit?, max?, legend?: [..], tones?: [..], bars: [{label, value | values: [..], tone?}]}
  bars(s, c) {
    const n = Math.max(...s.bars.map((b) => (b.values ?? [b.value]).length))
    const max = s.max ?? Math.max(...s.bars.flatMap((b) => b.values ?? [b.value]))
    const tones = s.tones ?? ["teal", "blue", "orange", "sleep"]
    // Wide: labels in a column on the left. Narrow: each label sits above its bars.
    const L = c.narrow ? 24 : 215
    const R = c.W - (c.narrow ? 76 : 90)
    let y = 20
    if (s.legend) {
      let lx = L
      s.legend.forEach((name, i) => {
        const t = tone(tones[i], "bars")
        c.rect(lx, y, 20, 20, { fill: t, fillStyle: "solid", stroke: t, roughness: 0.6 })
        c.text(lx + 30, y + 18, name, { size: c.S })
        lx += 56 + name.length * charW(c.S)
      })
      y += 46
    }
    for (const b of s.bars) {
      const vals = b.values ?? [b.value]
      if (c.narrow) y += c.text(L, y + c.S, b.label, { size: c.S, fill: STRONG, width: c.W - 48 }) + 2
      const rowH = vals.length * 26 + (c.narrow ? 6 : 18)
      if (!c.narrow) c.text(200, y + rowH / 2 + 6, b.label, { anchor: "end", size: c.S + 1, width: 190 })
      vals.forEach((v, i) => {
        const t = tone(b.tone ?? tones[i], "bars")
        const w = Math.max(3, (v / max) * (R - L))
        const by = y + (c.narrow ? 2 : 6) + i * 26
        c.rect(L, by, w, 20, { fill: t, fillStyle: "hachure", hachureGap: 5, stroke: t, roughness: 0.9 })
        c.text(L + w + 8, by + 17, `${v}${s.unit ?? ""}`, { size: c.S, fill: STRONG })
      })
      y += rowH + (c.narrow ? 14 : 8)
    }
    return y + 6
  },

  // Several inputs feeding one result. {inputs: [string | {label, note?, tone?}], output, tone?, note?}
  flow(s, c) {
    const items = s.inputs.map((i) => (typeof i === "string" ? { label: i } : i))
    const ot = tone(s.tone ?? "teal", "flow")
    const gap = 12, bh = 48
    const top = 20
    let end
    if (c.narrow) {
      // Inputs stacked full width, one arrow down to the result.
      const bw = c.W - 48
      items.forEach((it, i) => {
        const y = top + i * (bh + gap)
        c.rect(24, y, bw, bh, { stroke: tone(it.tone, "flow") })
        c.text(40, y + 32, it.label, { size: c.S + 1 })
        if (it.note) c.text(24 + bw - 14, y + 32, it.note, { anchor: "end", size: c.S, fill: MUTED })
      })
      const oy = top + items.length * (bh + gap) + 50
      c.arrow(c.W / 2, oy - 46, c.W / 2, oy - 8, { strokeWidth: 1.8 })
      const lines = wrap(s.output, c.F + 3, bw - 30).length
      const oh = 40 + lines * (c.F + 3)
      c.rect(24, oy, bw, oh, { stroke: ot, strokeWidth: 2.6, fill: ot, fillStyle: "hachure", hachureGap: 12, fillWeight: 0.8 })
      c.text(c.W / 2, oy + 26 + c.F * 0.6, s.output, { anchor: "middle", size: c.F + 3, fill: STRONG, width: bw - 30 })
      end = oy + oh + 10
    } else {
      const bw = 250
      const h = Math.max(items.length * (bh + gap) - gap, 120)
      const ox = c.W - 30 - 230, oy = top + h / 2 - 45
      items.forEach((it, i) => {
        const y = top + i * (bh + gap)
        c.rect(30, y, bw, bh, { stroke: tone(it.tone, "flow") })
        c.text(46, y + 32, it.label, { size: c.S + 1 })
        if (it.note) c.text(30 + bw - 14, y + 32, it.note, { anchor: "end", size: c.S, fill: MUTED })
        c.curve([[30 + bw + 6, y + bh / 2], [ox - 80, (y + bh / 2 + oy + 45) / 2], [ox - 8, oy + 45]], { strokeWidth: 1.6 })
      })
      c.arrow(ox - 30, oy + 45, ox - 6, oy + 45, { strokeWidth: 1.6 })
      c.rect(ox, oy, 230, 90, { stroke: ot, strokeWidth: 2.6, fill: ot, fillStyle: "hachure", hachureGap: 12, fillWeight: 0.8 })
      const lines = wrap(s.output, c.F + 4, 210).length
      c.text(ox + 115, oy + 45 - ((lines - 1) * (c.F + 4)) / 2 + 10, s.output, { anchor: "middle", size: c.F + 4, fill: STRONG, width: 210 })
      end = Math.max(top + h, oy + 90) + 10
    }
    if (s.note) end += c.text(c.W / 2, end + 26, s.note, { anchor: "middle", size: c.S, fill: MUTED, width: c.W - 48 }) + 10
    return end + 10
  },

  // Numbered steps: rows of up to three when wide (two by two for four), one column when narrow. {steps: [{title, text?}]}
  steps(s, c) {
    const per = c.narrow ? 1 : s.steps.length === 4 ? 2 : Math.min(3, s.steps.length)
    const gap = c.narrow ? 34 : 40
    const L = c.narrow ? 24 : 30
    const bw = (c.W - 2 * L - gap * (per - 1)) / per
    const inner = bw - 30
    let y = 20
    let n = 1
    for (let r = 0; r < s.steps.length; r += per) {
      const row = s.steps.slice(r, r + per)
      const heights = row.map((st) => 76 + wrap(st.title, c.F, inner).length * c.F * 1.05 + (st.text ? wrap(st.text, c.S, inner).length * c.S * 1.05 + 8 : 0))
      const bh = Math.max(...heights)
      row.forEach((st, i) => {
        const x = L + i * (bw + gap)
        c.rect(x, y, bw, bh, { stroke: tone(st.tone, "steps") })
        c.circle(x + 32, y + 32, 34, { stroke: "var(--optimal)", strokeWidth: 2.2 })
        c.text(x + 32, y + 41, n++, { anchor: "middle", fill: "var(--optimal)" })
        const th = c.text(x + 15, y + 86, st.title, { width: inner, fill: STRONG })
        if (st.text) c.text(x + 15, y + 86 + th + 2, st.text, { width: inner, size: c.S, fill: MUTED })
        if (i < row.length - 1) c.arrow(x + bw + 6, y + bh / 2, x + bw + gap - 6, y + bh / 2, { strokeWidth: 1.6 })
      })
      y += bh
      if (r + per < s.steps.length) {
        if (c.narrow) c.arrow(c.W / 2, y + 4, c.W / 2, y + gap - 4, { strokeWidth: 1.6 })
        y += c.narrow ? gap : 30
      }
    }
    return y + 14
  },

  // A trend. {series: [{label?, points: [..], tone?}], band?: {from, to, label?}, yLabel?, xLabels?: [..], notes?: [{at, text, series?}], min?, max?}
  line(s, c) {
    const L = c.narrow ? 30 : 50, R = c.W - 20
    // Labels and notes sit in a strip above the plot, so they never cross the line.
    const T = 40 + (s.yLabel ? 34 : 0) + (s.notes?.length ? 44 : 0)
    const B = T + (c.narrow ? 190 : 230)
    const all = s.series.flatMap((se) => se.points).concat(s.band ? [s.band.from, s.band.to] : [])
    const lo = s.min ?? Math.min(...all), hi = s.max ?? Math.max(...all)
    const pad = (hi - lo) * 0.1 || 1
    const y = (v) => B - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (B - T)
    const len = Math.max(...s.series.map((se) => se.points.length))
    const x = (i) => L + (i / Math.max(1, len - 1)) * (R - L)
    if (s.yLabel) c.text(L - 20, 32, s.yLabel, { size: c.S, fill: MUTED })
    c.line(L - 14, B + 8, R, B + 8, { strokeWidth: 1.4, stroke: MUTED })
    if (s.band) {
      c.rect(L, y(s.band.to), R - L, y(s.band.from) - y(s.band.to), { stroke: "none", fill: "var(--optimal)", fillStyle: "hachure", hachureGap: 10, fillWeight: 0.7, hachureAngle: -30 })
      if (s.band.label) c.text(L + 6, y(s.band.from) + c.S + 4, s.band.label, { size: c.S, fill: "var(--optimal)" })
    }
    let legendX = R
    s.series.forEach((se, k) => {
      const t = tone(se.tone ?? ["blue", "orange", "teal"][k], "line")
      c.curve(se.points.map((v, i) => [x(i), y(v)]), { stroke: t, strokeWidth: 2.6, roughness: 0.8 })
      if (se.label) {
        c.text(legendX, s.yLabel ? 32 : 26, se.label, { anchor: "end", size: c.S, fill: t })
        legendX -= String(se.label).length * charW(c.S) + 24
      }
    })
    ;(s.xLabels ?? []).forEach((l, i, arr) => {
      const xi = L + (i / Math.max(1, arr.length - 1)) * (R - L)
      c.text(xi, B + 38, l, { anchor: i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle", size: c.S, fill: MUTED })
    })
    for (const n of s.notes ?? []) {
      const v = s.series[n.series ?? 0].points[n.at]
      const px = x(n.at)
      const ty = T - 26
      const half = (String(n.text).length * charW(c.S + 1)) / 2 + 4
      c.text(Math.min(Math.max(px, L + half), R - half), ty, n.text, { anchor: "middle", fill: STRONG, size: c.S + 1 })
      c.arrow(px, ty + 10, px, y(v) - 10, { strokeWidth: 1.5, stroke: STRONG })
    }
    return B + (s.xLabels ? 54 : 22)
  },

  // Side-by-side columns of points, stacked when narrow. {columns: [{title, items: [..], tone?}]}
  compare(s, c) {
    const n = s.columns.length
    const per = c.narrow ? 1 : n
    const gap = 24, L = c.narrow ? 24 : 30
    const bw = (c.W - 2 * L - gap * (per - 1)) / per
    const size = c.S + 1
    const colH = (col) => 76 + wrap(col.title, c.F + 2, bw - 20).length * (c.F + 2) * 1.05 - (c.F + 2) + col.items.reduce((h, it) => h + wrap(it, size, bw - 50).length * size * 1.05 + 12, 0)
    const rowH = c.narrow ? null : Math.max(...s.columns.map(colH))
    let y = 20
    s.columns.forEach((col, i) => {
      const x = c.narrow ? L : L + i * (bw + gap)
      const top = c.narrow ? y : 20
      const bh = c.narrow ? colH(col) : rowH
      const t = tone(col.tone ?? ["blue", "teal", "orange"][i], "compare")
      c.rect(x, top, bw, bh, { stroke: t, strokeWidth: 2.2 })
      let ty = top + 42
      ty += c.text(x + bw / 2, ty, col.title, { anchor: "middle", fill: t, size: c.F + 2, width: bw - 20 }) + 8
      for (const it of col.items) {
        c.circle(x + 22, ty + 4 - size * 0.4, 7, { stroke: t, fill: t, fillStyle: "solid", roughness: 0.4 })
        ty += c.text(x + 36, ty + 4, it, { width: bw - 50, size }) + 12
      }
      if (c.narrow) y += bh + 18
    })
    return c.narrow ? y + 2 : rowH + 40
  },
}

export function renderSketch(spec, where = "sketch") {
  const kind = KINDS[spec.kind]
  if (!kind) throw new Error(`${where}: unknown kind "${spec.kind}". Use one of: ${Object.keys(KINDS).join(", ")}`)
  if (!spec.alt) throw new Error(`${where}: every sketch needs "alt", a one-sentence description for screen readers`)
  const seed = hash(JSON.stringify(spec))
  const svgs = Object.entries(LAYOUTS).map(([name, layout]) => {
    const c = new Canvas(seed, layout)
    return c.svg(kind(spec, c), spec.alt, name)
  })
  const caption = spec.caption ? `<figcaption>${esc(spec.caption)}</figcaption>` : ""
  return `<figure class="sketch">${svgs.join("")}${caption}</figure>`
}

// Sätteri mdast plugin (Astro 7's Markdown processor): ```sketch blocks become figures. A bad spec fails the build
// with the file and line.
export const sketchPlugin = {
  name: "pulse-sketch",
  code(node, ctx) {
    if (node.lang !== "sketch") return
    const file = ctx.fileURL ? ctx.fileURL.pathname.split("/").pop() : "post"
    const where = `${file} line ${node.position?.start.line ?? "?"}`
    let spec
    try {
      spec = JSON.parse(node.value)
    } catch (e) {
      throw new Error(`${where}: sketch is not valid JSON (${e.message})`)
    }
    ctx.replaceNode(node, { type: "html", value: renderSketch(spec, where) })
  },
}
