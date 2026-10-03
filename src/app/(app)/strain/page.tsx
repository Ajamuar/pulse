import { Flame } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatValue } from "@/lib/format"
import { DATA_COLORS } from "@/lib/bands"
import { reasonCopy } from "@/lib/reasons"
import { dayHref, activityHref } from "@/lib/url"
import { IntradayHrChart } from "@/components/charts/IntradayHrChart"
import { TrendChart, type TrendSeries } from "@/components/charts/TrendChart"
import { ZoneBars } from "@/components/charts/ZoneBars"
import { ActivityCard } from "@/components/metrics/ActivityCard"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { DeltaMark, MetricTags } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { InfoButton } from "@/components/shells/InfoButton"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { getStrain } from "@/server/queries/strain"
import type { StrainVM } from "@/server/queries/types"
import { pageDay, type SearchParams } from "../_lib/day"
import { CALORIES_INFO, STRAIN_INFO, STRAIN_TARGET_INFO } from "../_lib/info"
import { CAPTION, hrSeries, LABEL, LEGEND, statProps, trendProps } from "../_lib/view"

export const metadata = { title: "Strain", description: "Day Strain, your Strain Target, heart-rate zones, activities, calories burned and workout time." }

/** Bottom first: resting under active, the day's base burn with movement on top. */
const CALORIE_PARTS: readonly TrendSeries[] = [
  { key: "resting", label: "Resting", color: DATA_COLORS["energy-resting"].css },
  { key: "active", label: "Active", color: DATA_COLORS["energy-active"].css },
]
/** The new cards open on the week; the page's Strain trend keeps its month default. */
const WEEK_MONTH = ["w", "m"] as const

/** Strain `/strain?d=` (spec §7.3). */
export default async function StrainPage({ searchParams }: PageProps<"/strain">) {
  const { d, today, timeZone, weekly } = await pageDay(searchParams as SearchParams, "/strain")
  const vm = getStrain(d)
  const s = vm.strain
  const t = vm.target.value
  const trend = trendProps(vm.trend)
  const calories = vm.calories.map((p) => ({ date: p.day, value: p.value, provisional: p.provisional, parts: p.parts }))

  return (
    <DetailShell
      title="Strain"
      info={STRAIN_INFO}
      dateSwitcher={{ mode: "day", placement: "header" }}
      notch
      hero={
        <ScoreDial
          variant="strain"
          size="lg"
          value={s.value}
          reason={s.reason}
          target={t ? [t.low, t.high] : null}
          extraTags={vm.soFar && s.value !== null ? ["so_far"] : undefined}
        />
      }
      summary={
        <Card className="gap-0 px-4 py-1 ring-0">
          <div className="divide-y divide-border">
            <TargetRow vm={vm} />
            {vm.summary.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, { d, today })} />
            ))}
          </div>
          <p className={cn(LEGEND, "flex items-center gap-2")}>
            <span className="inline-flex items-center gap-1">
              <DeltaMark dir="up" tone="good" />
              <DeltaMark dir="down" tone="bad" />
            </span>
            Today vs. prior 30 days
          </p>
        </Card>
      }
      insight={vm.coach && <InsightCard body={vm.coach} action={{ label: "Plan tonight’s sleep", href: dayHref("/sleep#planner", d, today) }} />}
      primary={
        <SectionShell variant="card" title="Heart rate" level={2}>
          <IntradayHrChart data={hrSeries(vm.hr, vm.maxHr)} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="zones" variant="card" title="Time in zones" level={2} fill className="xl:row-span-2">
          <ZoneBars variant="rows" data={vm.zones} note={vm.zoneNote} emptyCopy={vm.isToday ? "No heart-rate zones yet today." : "No heart-rate zones on this day."} />
        </SectionShell>,
        <SectionShell key="activities" variant="card" title="Activities" level={2}>
          {vm.activities.length ? (
            <div className="space-y-1.5">
              {vm.activities.map((a) => (
                <ActivityCard key={a.id} name={a.name} kind={a.activityKind} strain={a.strain} start={a.start} end={a.end} distanceKm={a.distanceKm} paceS={a.paceS} href={activityHref(a.id)} timeZone={timeZone} />
              ))}
            </div>
          ) : (
            <EmptyState body="No activities on this day." />
          )}
        </SectionShell>,
        <SectionShell key="trend" variant="card" title={weekly ? "Weekly trends" : "Strain trend"} level={2}>
          <TrendChart label="Strain" format="decimal1" colorBy="strain" {...trend} />
        </SectionShell>,
        <SectionShell key="calories" variant="card" title="Calories burned" info={CALORIES_INFO} level={2}>
          <TrendChart
            label="Calories burned"
            unit="kcal"
            format="grouped"
            colorBy="single"
            stack={CALORIE_PARTS}
            headline="day"
            ranges={WEEK_MONTH}
            defaultRange="w"
            data={{ value: calories, reason: null, provisional: false }}
          />
        </SectionShell>,
        <SectionShell key="workouts" variant="card" title="Workout duration" level={2}>
          <TrendChart label="Workout duration" format="duration" colorBy="strain" ranges={WEEK_MONTH} defaultRange="w" {...trendProps(vm.workouts)} />
        </SectionShell>,
      ]}
    />
  )
}

/** "Strain Target 12.0 - 15.0": a range, so it is drawn beside the KeyStatRows rather than as one (no arrow). */
function TargetRow({ vm }: { vm: StrainVM }) {
  const t = vm.target
  const text = t.value ? `${formatValue("decimal1", t.value.low)} - ${formatValue("decimal1", t.value.high)}` : "--"
  const reason = t.value ? null : reasonCopy(t.reason, t.nightsLeft).short
  return (
    <div className="flex min-h-13 items-center gap-3 py-2">
      <span className="sr-only">{reason ? `Strain Target: ${reason}` : `Strain Target ${text.replace(" - ", " to ")}`}</span>
      <span aria-hidden className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5">
        <Flame strokeWidth={1.75} />
      </span>
      <span aria-hidden className="min-w-0 flex-1">
        <span className={cn(LABEL, "block truncate")}>Strain Target</span>
        {reason && <span className={cn(CAPTION, "mt-0.5 block truncate")}>{reason}</span>}
        {t.value?.estimate && <MetricTags extra={["estimate"]} className="mt-1 justify-start" />}
      </span>
      <InfoButton info={STRAIN_TARGET_INFO} label="Strain Target" variant="card" />
      {/* Same grid as KeyStatRow's value + arrow column, so the values right-align down the card. */}
      <span aria-hidden className="grid shrink-0 grid-cols-[auto_8px] gap-x-2">
        <span className={cn("font-numeric text-xl leading-6 font-bold tabular-nums", reason && "text-muted-foreground")}>{text}</span>
      </span>
    </div>
  )
}
