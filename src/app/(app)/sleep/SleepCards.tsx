// Sleep's measure cards drawn the way WHOOP draws them: hours against need as two bars, and the last five nights' bed
// and wake times against your usual ones. Plain DOM meters, no chart library. (Restorative sleep and efficiency are
// TrendCharts on the page.)
import { cn } from "@/lib/utils"
import { hmm } from "@/lib/format"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { deltaTone } from "@/lib/bands"
import { CAPTION, DeltaMark, LABEL } from "@/components/metrics/primitives"
import type { KeyStat, SleepVM } from "@/server/queries/types"

const BAR = "h-3.5 rounded-[3px]"
const signed = (min: number, sign: "+" | "−") => `${sign}${hmm(Math.abs(min))}`

/** WHOOP's card headline: the percentage large with its arrow against the prior 30 nights, and their mean under it. */
function Headline({ value, stat }: { value: number; stat?: KeyStat }) {
  const avg = stat?.average ?? null
  const t = avg === null ? null : deltaTone("up", value, avg, stat?.sd)
  return (
    <div>
      <p className="flex items-center gap-1.5">
        <span className="font-numeric text-4xl leading-10 font-bold tracking-[-0.01em] tabular-nums">{Math.round(value)}%</span>
        {t && <DeltaMark dir={t.dir} tone={t.tone} />}
      </p>
      {avg !== null && (
        <p className="font-numeric text-[13px] leading-4 font-medium text-muted-foreground tabular-nums">
          <span className="sr-only">Prior 30-night average </span>
          {Math.round(avg)}%
        </p>
      )}
    </div>
  )
}

/** A swatch, a name and a right-aligned value: the legend under a bar. */
function Legend({ rows }: { rows: { swatch: string; label: string; value: string }[] }) {
  return (
    <dl className="mt-4 space-y-2 rounded-lg bg-inset px-3 py-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-[13px] leading-4 font-medium">
          <span aria-hidden className={cn("size-3 shrink-0 rounded-[3px]", r.swatch)} />
          <dt className="flex-1 text-foreground-secondary">{r.label}</dt>
          <dd className="font-numeric font-semibold tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HoursVsNeed({ vm }: { vm: SleepVM }) {
  const m = vm.hoursVsNeed
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  const h = m.value
  const stat = vm.summary.find((k) => k.key === "hours")
  const scale = Math.max(h.asleepMin, h.needMin, 1)
  const pct = (min: number) => `${Math.min(100, (min / scale) * 100)}%`
  const { baselineMin, strainMin, debtMin, napMin } = h.parts
  return (
    <div>
      <Headline value={(h.asleepMin / h.needMin) * 100} stat={stat} />
      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className={cn(LABEL, "text-muted-foreground")}>Hours of sleep</span>
            <span className="font-numeric text-lg leading-6 font-bold tabular-nums">{hmm(h.asleepMin)}</span>
          </p>
          <div aria-hidden className={cn("relative bg-secondary", BAR)}>
            <div className={cn("absolute inset-y-0 left-0 bg-sleep", BAR)} style={{ width: pct(h.asleepMin) }} />
            {/* Where the need ends: a hairline through the track, so a short night leaves a visible gap and a long one a visible surplus. */}
            <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: pct(h.needMin) }} />
          </div>
        </div>
        <div>
          <p className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className={cn(LABEL, "text-muted-foreground")}>Sleep needed</span>
            <span className="font-numeric text-lg leading-6 font-bold tabular-nums">{hmm(h.needMin)}</span>
          </p>
          {h.calibrating ? (
            <p className={CAPTION}>Your need settles after 7 nights. Using {hmm(h.needMin)} until then.</p>
          ) : (
            <div aria-hidden className="flex gap-0.5" style={{ width: pct(h.needMin) }}>
              {[
                [baselineMin, "bg-foreground/70"],
                [strainMin, "bg-strain"],
                [debtMin, "bg-foreground/35"],
              ].map(([min, color], i) => (
                <span key={i} className={cn(BAR, "first:rounded-r-none", color as string)} style={{ flexGrow: Math.max(0, min as number), flexBasis: 0 }} />
              ))}
            </div>
          )}
        </div>
      </div>
      {!h.calibrating && (
        <Legend
          rows={[
            { swatch: "bg-foreground/70", label: "Healthy minimum", value: hmm(baselineMin) },
            { swatch: "bg-strain", label: "Recent strain", value: signed(strainMin, "+") },
            { swatch: "bg-foreground/35", label: "Sleep debt", value: signed(debtMin, "+") },
            ...(napMin > 0 ? [{ swatch: "bg-sleep", label: "Naps", value: signed(napMin, "−") }] : []),
          ]}
        />
      )}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")
/** Minutes from local midnight (negative = before it) as 24-hour clock text. */
const at = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/**
 * A path through the nights' optimal times (x and y in 0-100): level across each night's column, easing to the next
 * night's height between columns, from the first column's left edge to the last one's right. A missing night breaks it.
 */
function optimalPath(points: ({ x: number; y: number } | null)[]) {
  let d = ""
  let prev: { x: number; y: number } | null = null
  for (const p of points) {
    if (!p) {
      prev = null
      continue
    }
    if (!prev) d += `M${p.x - 9} ${p.y} L${p.x + 4} ${p.y}`
    else {
      const mid = (prev.x + p.x) / 2
      d += ` C${mid} ${prev.y} ${mid} ${p.y} ${p.x - 4} ${p.y} L${p.x + 4} ${p.y}`
    }
    prev = p
  }
  return prev ? `${d} L${prev.x + 9} ${prev.y}` : d
}

export function SleepConsistency({ vm }: { vm: SleepVM }) {
  const m = vm.consistency
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  const c = m.value
  const nights = c.nights.flatMap((n) => (n ? [n] : []))
  const beds = nights.flatMap((n) => [n.bed, ...(n.typicalBed != null ? [n.typicalBed] : [])])
  const wakes = nights.flatMap((n) => [n.wake, ...(n.typicalWake != null ? [n.typicalWake] : [])])
  // Axis in 4-hour steps (19:00, 23:00, 03:00…) with room above the earliest bed and below the latest wake for last
  // night's labels.
  const lo = Math.floor((Math.min(...beds) - 60) / 240) * 240
  const hi = Math.ceil((Math.max(...wakes) + 60) / 240) * 240
  const pctOf = (min: number) => ((min - lo) / (hi - lo)) * 100
  const ticks = Array.from({ length: Math.floor((hi - lo) / 240) + 1 }, (_, i) => lo + i * 240)
  const last = c.nights.at(-1)
  const optimal = (pick: (n: (typeof nights)[number]) => number | null) =>
    optimalPath(c.nights.map((n, i) => (n && pick(n) != null ? { x: i * 20 + 10, y: pctOf(pick(n)!) } : null)))
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <Headline value={c.pct} stat={vm.summary.find((k) => k.key === "consistency")} />
        <p className="flex items-center gap-2 pb-px text-[13px] leading-4 font-medium text-foreground-secondary">
          <span aria-hidden className="w-5 border-t-[1.5px] border-dashed border-foreground/55" />
          Optimal bed/wake time
        </p>
      </div>
      <div role="img" aria-label={`Bed and wake times for the last five nights${last ? `, last night ${at(last.bed)} to ${at(last.wake)}` : ""}`} className="mt-4 flex gap-3">
        <div aria-hidden className="relative h-52 w-10 shrink-0 font-numeric text-[12px] leading-3 font-semibold text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${pctOf(t)}%` }}>
              {at(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div aria-hidden className="relative h-52">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${pctOf(t)}%` }} />
            ))}
            {/* Each night's optimal bed and wake time, joined into one dashed line that eases from night to night. */}
            <svg className="absolute inset-0 z-10 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              {[optimal((n) => n.typicalBed), optimal((n) => n.typicalWake)].map((d, i) => (
                <path key={i} d={d} fill="none" stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            <div className="absolute inset-0 grid grid-cols-5">
              {c.nights.map((n, i) =>
                n ? (
                  <div key={i} className="relative">
                    <div
                      className={cn("absolute left-1/2 w-[18px] -translate-x-1/2 rounded-[3px]", i === 4 ? "bg-sleep" : "bg-foreground/30")}
                      style={{ top: `${pctOf(n.bed)}%`, bottom: `${100 - pctOf(n.wake)}%` }}
                    />
                    {/* Last night's times beside its bar, as WHOOP labels them: bed above, wake below, clear of the dashed lines. */}
                    {i === 4 && (
                      <>
                        <span className="absolute left-1/2 z-20 -translate-x-1/2 -translate-y-[calc(100%+4px)] font-numeric text-[13px] leading-4 font-bold whitespace-nowrap text-sleep tabular-nums" style={{ top: `${pctOf(Math.min(n.bed, n.typicalBed ?? n.bed))}%` }}>
                          {at(n.bed)}
                        </span>
                        <span className="absolute left-1/2 z-20 -translate-x-1/2 translate-y-1 font-numeric text-[13px] leading-4 font-bold whitespace-nowrap text-sleep tabular-nums" style={{ top: `${pctOf(Math.max(n.wake, n.typicalWake ?? n.wake))}%` }}>
                          {at(n.wake)}
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div key={i} />
                ),
              )}
            </div>
          </div>
          <div aria-hidden className="mt-2 grid grid-cols-5 text-center text-[13px] leading-4 font-medium text-muted-foreground">
            {c.nights.map((n, i) => (
              <span key={i} className={cn(i === 4 && "font-bold text-foreground")}>
                {n?.label ?? "·"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
