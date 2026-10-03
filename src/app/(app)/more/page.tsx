import Link from "next/link"
import { connection } from "next/server"
import { Archive, BookOpen, CalendarDays, CalendarRange, ChartLine, ChevronRight, Database, ListChecks } from "lucide-react"
import { formatDay, rangeLabel } from "@/lib/format"
import { currentUser, DEMO_EMAIL } from "@/server/auth"
import { avatarSrc } from "@/server/avatar"
import { getDb } from "@/server/db"
import { userCtx } from "@/server/queries/common"
import { getMore } from "@/server/queries/settings"
import { LinkList, MORE_COLUMN, type LinkListRow } from "@/components/shells/LinkList"
import { PageShell } from "@/components/shells/PageShell"
import { CARD_LINK } from "@/components/shells/SectionShell"
import { UserAvatar } from "@/components/shells/UserAvatar"
import { cn } from "@/lib/utils"
import { About } from "./About"
import { SCORE_DOCS } from "./how-it-works/content"

export const metadata = { title: "More" }

/**
 * Phones have no sidebar, so More is the way to Settings there: the signed-in account as the first row (below
 * 768 px only; the rail and sidebar carry Settings from there).
 */
async function AccountRow() {
  const user = await currentUser()
  if (!user) return null
  const avatar = await avatarSrc(getDb(), user.userId)
  const demo = user.email === DEMO_EMAIL
  return (
    <Link href="/settings" className={cn(CARD_LINK, "flex min-h-18 items-center gap-3 px-4 py-3 md:hidden")}>
      <span className="size-11 shrink-0">
        <UserAvatar src={avatar} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[22px] font-semibold">{demo ? "Demo" : user.name || user.username || user.email}</span>
        <span className="block text-[13px] leading-[18px] text-muted-foreground">Account, data source, profile</span>
      </span>
      <span className="sr-only">Settings</span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
    </Link>
  )
}

/** More `/more` (spec §7.14, U21): everything that isn't configuration. Settings stays Account, Data source, Profile. */
export default async function MorePage() {
  await connection()
  const vm = await getMore(await userCtx())
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
      <AccountRow />
      {/* One 640 px column, as Settings: a list reads top to bottom, and side-by-side columns sharing grid rows
          left holes whenever one section was shorter (no reports yet). */}
      <div className={MORE_COLUMN}>
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
