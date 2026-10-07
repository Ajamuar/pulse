import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppNavigationProvider, detailBackHref, useAppNavigationRoot } from "./AppNavigation"
import { DetailHeaderRow } from "./DetailHeader"

const route = vi.hoisted(() => ({ pathname: "/", search: "" }))
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}))
vi.mock("next/link", () => ({ default: ({ replace, children, ...props }: React.ComponentProps<"a"> & { replace?: boolean }) => <a {...props} data-replace={replace}>{children}</a> }))
vi.mock("./ShellStatus", () => ({ useShellCalendar: () => ({ today: "2026-10-07" }) }))

const today = "2026-10-07"

function Probe({ explicit }: { explicit?: string }) {
  const root = useAppNavigationRoot()
  return <a href={detailBackHref(route.pathname, root, today, new URLSearchParams(route.search).get("d"), explicit)}>Back</a>
}

afterEach(cleanup)

describe("primary navigation return", () => {
  it("renders Back as a replacement link to the main screen after opening a saved chat", () => {
    route.pathname = "/health"
    route.search = ""
    const view = render(<AppNavigationProvider><DetailHeaderRow title="Coach" /></AppNavigationProvider>)
    route.pathname = "/coach/chats"
    view.rerender(<AppNavigationProvider><DetailHeaderRow title="Chats" backHref="/coach" /></AppNavigationProvider>)
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/coach")
    route.pathname = "/coach"
    route.search = "c=saved-chat"
    view.rerender(<AppNavigationProvider><DetailHeaderRow title="Coach" /></AppNavigationProvider>)
    const back = screen.getByRole("link", { name: "Back" })
    expect(back.getAttribute("href")).toBe("/health")
    expect(back.getAttribute("data-replace")).toBe("true")
  })
  it.each(["/", "/health", "/journal", "/more"])("returns a selected coach chat to %s, skipping chat history", (root) => {
    route.pathname = root
    route.search = ""
    const tree = <AppNavigationProvider><Probe /></AppNavigationProvider>
    const view = render(tree)
    for (const [pathname, search] of [["/coach", ""], ["/coach/chats", ""], ["/coach", "id=saved-chat"]]) {
      route.pathname = pathname
      route.search = search
      view.rerender(<AppNavigationProvider><Probe /></AppNavigationProvider>)
    }
    expect(screen.getByRole("link").getAttribute("href")).toBe(root)
  })

  it("keeps the main screen's day across date changes and related details", () => {
    route.pathname = "/"
    route.search = "d=2026-10-01&checkin=1"
    const view = render(<AppNavigationProvider><Probe /></AppNavigationProvider>)
    for (const pathname of ["/recovery", "/metric/hrv", "/sleep"]) {
      route.pathname = pathname
      route.search = "d=2026-10-03"
      view.rerender(<AppNavigationProvider><Probe /></AppNavigationProvider>)
      expect(screen.getByRole("link").getAttribute("href")).toBe("/?d=2026-10-01")
    }
  })

  it("updates the return screen when a different main tab is selected", () => {
    route.pathname = "/"
    route.search = ""
    const view = render(<AppNavigationProvider><Probe /></AppNavigationProvider>)
    route.pathname = "/health"
    view.rerender(<AppNavigationProvider><Probe /></AppNavigationProvider>)
    route.pathname = "/health/stress"
    view.rerender(<AppNavigationProvider><Probe /></AppNavigationProvider>)
    expect(screen.getByRole("link").getAttribute("href")).toBe("/health")
  })

  it("honors explicit nested destinations and gives direct links a parent", () => {
    expect(detailBackHref("/coach/chats", "/more", today, null, "/coach")).toBe("/coach")
    expect(detailBackHref("/activity/123", "/", today, null, "/strain?d=2026-10-01")).toBe("/strain?d=2026-10-01")
    for (const [path, parent] of [["/health/stress", "/health"], ["/journal/insights", "/journal"], ["/reports/week", "/more"], ["/settings", "/more"], ["/coach", "/"]]) {
      expect(detailBackHref(path, null, today)).toBe(parent)
    }
    expect(detailBackHref("/metric/hrv", null, today, "2026-10-01")).toBe("/?d=2026-10-01")
  })
})
