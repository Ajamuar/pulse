import Link from "next/link"
import { cn } from "@/lib/utils"
import { PageShell } from "@/components/shells/PageShell"
import { CHARTS } from "./_catalogue/charts"
import { BRAND, PRIMITIVES } from "./_catalogue/foundations"
import { METRICS } from "./_catalogue/metrics"
import { SHELLS } from "./_catalogue/shells"
import type { KitEntry, KitGroup, KitState } from "./_catalogue/types"

const GROUPS: KitGroup[] = [
  { id: "shells", title: "Shells", blurb: "Layout and chrome. Feature code composes these; it never sets breakpoints itself.", entries: SHELLS },
  { id: "metrics", title: "Metrics", blurb: "Numbers and their honest states. Every metric renders loading, empty, reason, provisional and value through MetricState.", entries: METRICS },
  { id: "charts", title: "Charts", blurb: "Recharts inside ChartFigure (ChartFrame.tsx): a figure, an sr-only summary and a fixed height.", entries: CHARTS },
  { id: "brand", title: "Brand", blurb: "The wordmark, the mark and the third-party marks. Rules in docs/design/brand.md.", entries: BRAND },
  { id: "ui", title: "UI primitives", blurb: "The shadcn primitives the app uses, in Pulse's sizes.", entries: PRIMITIVES },
]

const NAV_LINK =
  "block rounded-md px-2 py-1 text-[13px] leading-5 text-foreground-secondary transition-[color,background-color] duration-150 ease-standard outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
const GROUP_LABEL = "px-2 text-[11px] leading-4 font-bold tracking-[0.1em] text-muted-foreground uppercase"
const GRID = { 2: "md:grid-cols-2", 3: "md:grid-cols-2 xl:grid-cols-3" } as const

function Frame({ state }: { state: KitState }) {
  return (
    <figure className={cn("flex min-w-0 flex-col rounded-2xl ring-1 ring-border", state.full && "md:col-span-full")}>
      <figcaption className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2 text-xs leading-4 font-medium text-muted-foreground">
        <span className="text-pretty">{state.name}</span>
        {state.narrow && <span className="shrink-0 font-numeric tabular-nums">320 px</span>}
      </figcaption>
      <div className={cn("flex-1 p-4", state.center && "grid place-items-center")}>
        {state.narrow ? <div className="mx-auto w-full max-w-[320px] outline-1 outline-offset-4 outline-border outline-dashed">{state.node}</div> : state.node}
      </div>
    </figure>
  )
}

function Entry({ entry }: { entry: KitEntry }) {
  return (
    // content-visibility skips layout and paint for entries off screen, which keeps this long page fast.
    <article id={entry.id} aria-labelledby={`${entry.id}-name`} className="scroll-mt-20 space-y-4 [contain-intrinsic-size:auto_640px] [content-visibility:auto]">
      <header className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id={`${entry.id}-name`} className="text-[17px] leading-6 font-semibold text-balance">
            {entry.name}
          </h3>
          <code className="text-xs leading-4 break-all text-muted-foreground">{entry.file}</code>
        </div>
        <p className="max-w-[72ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">{entry.use}</p>
        {entry.props.length > 0 && (
          <ul aria-label="Key props" className="flex flex-wrap gap-1.5">
            {entry.props.map((p) => (
              <li key={p}>
                <code className="block rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-xs leading-4 text-foreground-secondary">{p}</code>
              </li>
            ))}
          </ul>
        )}
      </header>
      <div className={cn("grid gap-3", GRID[entry.cols ?? 2])}>
        {entry.states.map((s) => (
          <Frame key={s.name} state={s} />
        ))}
      </div>
    </article>
  )
}

/** The component catalogue: every shell and kit component in every state, from typed fixtures (dev only, see layout.tsx). */
export default function KitPage() {
  return (
    <PageShell title="Component kit" dateSwitcher={{ mode: "day" }}>
      <div className="xl:grid xl:grid-cols-[176px_minmax(0,1fr)] xl:gap-10">
        {/* Laptop: a sticky index of every component. Phone and tablet: group links at the top, each group lists its own. */}
        <nav aria-label="Component index" className="hidden xl:block">
          <div className="sticky top-20 -ml-2 max-h-[calc(100dvh-6rem)] space-y-5 overflow-y-auto overscroll-contain pb-8">
            {GROUPS.map((g) => (
              <div key={g.id} className="space-y-1">
                <a href={`#${g.id}`} className={cn(GROUP_LABEL, "block outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50")}>
                  {g.title}
                </a>
                <ul>
                  {g.entries.map((e) => (
                    <li key={e.id}>
                      <a href={`#${e.id}`} className={NAV_LINK}>
                        {e.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-12">
          <div className="space-y-4">
            <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
              Every shell and kit component in every state, from the typed fixtures in <code className="text-[13px]">src/components/__fixtures__/kit.ts</code>. Whole-page shells:{" "}
              <Link className="underline underline-offset-4 hover:text-foreground" href="/dev/kit/detail">
                DetailShell
              </Link>{" "}
              and{" "}
              <Link className="underline underline-offset-4 hover:text-foreground" href="/dev/kit/home">
                Home
              </Link>
              .
            </p>
            <nav aria-label="Component groups" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 xl:hidden">
              {GROUPS.map((g) => (
                <a
                  key={g.id}
                  href={`#${g.id}`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[13px] font-semibold outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {g.title}
                  <span className="font-numeric text-muted-foreground tabular-nums">{g.entries.length}</span>
                </a>
              ))}
            </nav>
          </div>

          {GROUPS.map((g) => (
            <section key={g.id} id={g.id} data-kit-group aria-labelledby={`${g.id}-title`} className="scroll-mt-20 space-y-8">
              <header className="space-y-2 border-b border-border pb-4">
                <h2 id={`${g.id}-title`} className="text-2xl leading-8 font-semibold tracking-[-0.01em]">
                  {g.title}
                </h2>
                <p className="max-w-[72ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">{g.blurb}</p>
                <ul aria-label={`${g.title} components`} className="flex flex-wrap gap-x-1 gap-y-0.5 pt-1 xl:hidden">
                  {g.entries.map((e) => (
                    <li key={e.id}>
                      <a href={`#${e.id}`} className={cn(NAV_LINK, "underline-offset-4 hover:underline")}>
                        {e.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </header>
              {g.entries.map((e) => (
                <Entry key={e.id} entry={e} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
