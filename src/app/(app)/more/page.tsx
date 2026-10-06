import { connection } from "next/server"
import { Archive, BookOpen, CalendarDays, CalendarRange, ChartLine, Database, ListChecks, Palette, Plug, Sparkles, UserRound } from "lucide-react"
import { formatDay, rangeLabel } from "@/lib/format"
import { currentUser, DEMO_EMAIL } from "@/server/auth"
import { coachAccess } from "@/server/coach/store"
import { userCtx } from "@/server/queries/common"
import { getMore } from "@/server/queries/settings"
import { LinkList, MORE_COLUMN, type LinkListRow } from "@/components/shells/LinkList"
import { PageShell } from "@/components/shells/PageShell"
import { About } from "./About"
import { SCORE_DOCS } from "./how-it-works/content"

export const metadata = { title: "More" }

/** More `/more` (spec §7.14, U21): everything that isn't configuration. Settings stays Account, Data source, Profile. */
export default async function MorePage() {
  await connection()
  const ctx = await userCtx()
  const [vm, user, coach] = await Promise.all([getMore(ctx), currentUser(), coachAccess(ctx.db, ctx.userId)])
  // Below 1280 px (where the sidebar lists Settings) each part of Settings is a row here, as the reference app's "Account & settings".
  const account = user?.email === DEMO_EMAIL ? "Demo" : user?.name || user?.username || user?.email
  const settings: LinkListRow[] = [
    { icon: UserRound, label: "Account", description: account ?? undefined, href: "/settings#account" },
    { icon: Plug, label: "Data source", href: "/settings#source" },
    { icon: Palette, label: "App", description: "Theme, install, notifications", href: "/settings#app" },
    ...(coach ? [{ icon: Sparkles, label: "Coach", description: "Provider, key, morning brief", href: "/settings#coach" }] : []),
  ]
  const reports: LinkListRow[] = [
    ...(vm.latestWeek
      ? [{ icon: CalendarRange, label: "Weekly report", aside: rangeLabel(vm.latestWeek.start, vm.latestWeek.end), href: `/reports/${vm.latestWeek.period}` }]
      : []),
    ...(vm.latestMonth
      ? [{ icon: CalendarDays, label: "Monthly report", aside: formatDay(vm.latestMonth.start, { month: "long" }), href: `/reports/${vm.latestMonth.period}` }]
      : []),
    { icon: Archive, label: "All reports", aside: vm.reportCount ? String(vm.reportCount) : undefined, href: "/reports" },
  ]

  return (
    <PageShell title="More">
      {/* One 640 px column, as Settings: a list reads top to bottom, and side-by-side columns sharing grid rows
          left holes whenever one section was shorter (no reports yet). */}
      <div className={MORE_COLUMN}>
        <LinkList title="Account & settings" rows={settings} className="xl:hidden" />
        <LinkList title="Reports" rows={reports} />
        <LinkList title="Trends" rows={[{ icon: ChartLine, label: "Trends", aside: "Up to 1 year", href: "/trends" }]} />
        <LinkList
          title="Journal"
          rows={[{ icon: ListChecks, label: "Behaviours", aside: `${vm.behaviours.shown} of ${vm.behaviours.total} shown`, href: "/more/behaviours" }]}
        />
        <LinkList title="Help" rows={[{ icon: BookOpen, label: "How Pulse works", aside: `${SCORE_DOCS.length} scores`, href: "/more/how-it-works" }]} />
        <LinkList title="Your data" rows={[{ icon: Database, label: "Export", aside: "CSV, JSON", href: "/more/data" }]} />
        <About version={vm.version} scoringVersion={vm.scoringVersion} />
      </div>
    </PageShell>
  )
}
