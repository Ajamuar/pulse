import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CoachViewport } from "./CoachViewport"

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.style.overflow = ""
})

describe("CoachViewport", () => {
  it("keeps the chat inside the visible viewport as the keyboard opens, pans and closes", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
    vi.stubGlobal("visualViewport", viewport)
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const flush = () => act(() => { callbacks.splice(0).forEach((callback) => callback(0)) })
    const { container, unmount } = render(<CoachViewport><div>Chat</div></CoachViewport>)
    const frame = container.firstElementChild as HTMLElement
    expect(frame.style.getPropertyValue("--coach-height")).toBe("844px")
    expect(document.documentElement.style.overflow).toBe("hidden")

    viewport.height = 480
    viewport.dispatchEvent(new Event("resize"))
    viewport.offsetTop = 24
    viewport.dispatchEvent(new Event("scroll"))
    expect(callbacks).toHaveLength(1)
    flush()
    expect(frame.style.getPropertyValue("--coach-height")).toBe("480px")
    expect(frame.style.getPropertyValue("--coach-top")).toBe("24px")

    viewport.height = 844
    viewport.offsetTop = 0
    viewport.dispatchEvent(new Event("resize"))
    flush()
    expect(frame.style.getPropertyValue("--coach-height")).toBe("844px")
    expect(frame.style.getPropertyValue("--coach-top")).toBe("0px")

    unmount()
    expect(document.documentElement.style.overflow).toBe("")
    viewport.dispatchEvent(new Event("resize"))
    expect(callbacks).toHaveLength(0)
  })

  it("preserves pinch zoom and restores the existing document scroll setting", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
    vi.stubGlobal("visualViewport", viewport)
    vi.stubGlobal("requestAnimationFrame", vi.fn())
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    document.documentElement.style.overflow = "clip"
    const { container, unmount } = render(<CoachViewport><div>Chat</div></CoachViewport>)
    const frame = container.firstElementChild as HTMLElement
    viewport.scale = 2
    viewport.height = 422
    viewport.offsetTop = 120
    viewport.dispatchEvent(new Event("resize"))
    const update = vi.mocked(requestAnimationFrame).mock.calls[0][0]
    act(() => update(0))
    expect(frame.style.getPropertyValue("--coach-height")).toBe("844px")
    expect(frame.style.getPropertyValue("--coach-top")).toBe("0px")
    unmount()
    expect(document.documentElement.style.overflow).toBe("clip")
  })
})
