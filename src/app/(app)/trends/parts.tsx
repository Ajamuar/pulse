// Shared by the Trends page and its loading shape.
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { TrendRange } from "@/lib/url"
import { TREND_GROUPS, TREND_METRICS, type TrendMetricKey } from "@/server/queries/trends"
import { PickerStrip } from "./PickerStrip"

/** Chart card beside the Averages card from 1280 px. */
export const TRENDS_GRID = "grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-4"

export const PERIOD: Record<TrendRange, { label: string; prior: string }> = {
  w: { label: "Last 7 days", prior: "the 7 days before" },
  m: { label: "Last 30 days", prior: "the 30 days before" },
  "6m": { label: "Last 6 months", prior: "the 6 months before" },
  "1y": { label: "Last 12 months", prior: "the year before" },
}

/** A strip that scrolls edge to edge on phone (with room for focus rings) and sits in the column from 768 px. */
const STRIP = "-mx-4 -my-1 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0"
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * The metric picker (spec §11 EX2): a segmented row of sections (Recovery & sleep, Activity, Body, Nutrition, Vitals),
 * then one pill per metric in the current section, wrapping from 768 px. A section opens its first metric; on phone
 * each strip scrolls its current item into view. Links keep `?r=`.
 */
export function MetricPicker({ current, r }: { current?: TrendMetricKey; r?: string }) {
  const group = TREND_METRICS.find((m) => m.key === current)?.group ?? TREND_GROUPS[0]
  const href = (key: TrendMetricKey) => `/trends?metric=${key}${r ? `&r=${r}` : ""}`
  return (
    <div className="flex flex-col gap-3">
      <PickerStrip label="Metric section" current={current} className={STRIP}>
        <ul className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
          {TREND_GROUPS.map((g) => (
            <li key={g}>
              <Link
                href={href(TREND_METRICS.find((m) => m.group === g)!.key)}
                replace
                scroll={false}
                aria-current={g === group ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-md px-3 text-xs font-bold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase transition-[background-color,color] duration-150 ease-standard hover:text-foreground",
                  "aria-[current=true]:bg-secondary aria-[current=true]:text-foreground",
                  FOCUS
                )}
              >
                {g}
              </Link>
            </li>
          ))}
        </ul>
      </PickerStrip>
      <PickerStrip label={`${group} metric`} current={current} className={STRIP}>
        <ul className="flex gap-2 md:flex-wrap">
          {TREND_METRICS.filter((m) => m.group === group).map((m) => (
            <li key={m.key} className="shrink-0">
              <Link
                href={href(m.key)}
                replace
                scroll={false}
                aria-current={m.key === current ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-full bg-muted px-4 text-[13px] font-bold tracking-[0.06em] text-muted-foreground uppercase transition-[background-color,color,scale] duration-150 ease-standard hover:text-foreground active:scale-[0.96]",
                  "aria-[current=page]:bg-foreground aria-[current=page]:text-primary-foreground",
                  FOCUS
                )}
              >
                {m.label}
              </Link>
            </li>
          ))}
        </ul>
      </PickerStrip>
    </div>
  )
}
