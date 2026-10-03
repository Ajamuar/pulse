import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ShellStatusProvider, STATUS_POLL_MS, useShellCalendar, useShellStatus, type ShellStatus } from "./ShellStatus"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const base: ShellStatus = {
  mode: "google",
  sync: { state: "ok", lastSuccessAt: 1 },
  connection: "connected",
  today: "2026-10-03",
  firstDay: "2026-04-06",
  timeZone: "Asia/Kolkata",
}

function setup() {
  const renders = { calendar: 0, status: 0 }
  function Calendar() {
    useShellCalendar()
    renders.calendar++
    return null
  }
  function Status() {
    useShellStatus()
    renders.status++
    return null
  }
  // Memoised children, as a page's subtree is: only a context change re-renders them.
  const kids = (
    <>
      <Calendar />
      <Status />
    </>
  )
  const ui = (v: ShellStatus) => <ShellStatusProvider value={v}>{kids}</ShellStatusProvider>
  return { renders, ui }
}

describe("ShellStatusProvider", () => {
  it("a sync re-renders status readers only; an identical refresh re-renders nobody; a new day re-renders both", () => {
    const { renders, ui } = setup()
    const r = render(ui(base))
    expect(renders).toEqual({ calendar: 1, status: 1 })
    r.rerender(ui({ ...base, sync: { state: "ok", lastSuccessAt: 2 } }))
    expect(renders).toEqual({ calendar: 1, status: 2 })
    r.rerender(ui({ ...base, sync: { state: "ok", lastSuccessAt: 2 } }))
    expect(renders).toEqual({ calendar: 1, status: 2 })
    r.rerender(ui({ ...base, sync: { state: "ok", lastSuccessAt: 2 }, today: "2026-10-04" }))
    expect(renders).toEqual({ calendar: 2, status: 3 })
  })
})

describe("ShellStatusProvider polling", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    refresh.mockReset()
  })

  it("polls /status while syncing, shows each answer, and refreshes the page once the sync ends", async () => {
    vi.useFakeTimers()
    const answers: ShellStatus[] = [
      { ...base, sync: { state: "syncing", lastSuccessAt: 1 }, connection: "importing", importProgress: { done: 40, total: 90 } },
      { ...base, sync: { state: "ok", lastSuccessAt: 9 } },
    ]
    const fetchMock = vi.fn(async () => Response.json(answers.shift()))
    vi.stubGlobal("fetch", fetchMock)
    const seen: (ShellStatus["importProgress"] | null)[] = []
    function Probe() {
      seen.push(useShellStatus().importProgress ?? null)
      return null
    }
    render(
      <ShellStatusProvider value={{ ...base, sync: { state: "syncing", lastSuccessAt: 1 }, connection: "importing", importProgress: { done: 10, total: 90 } }}>
        <Probe />
      </ShellStatusProvider>
    )
    await act(() => vi.advanceTimersByTimeAsync(STATUS_POLL_MS))
    expect(seen.at(-1)).toEqual({ done: 40, total: 90 })
    expect(refresh).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(STATUS_POLL_MS))
    expect(refresh).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 3))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not poll when idle", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<ShellStatusProvider value={base}>{null}</ShellStatusProvider>)
    await act(() => vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 3))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
