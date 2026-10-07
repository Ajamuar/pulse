"use client"

import * as React from "react"

export function CoachViewport({ children }: { children: React.ReactNode }) {
  const frame = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const viewport = window.visualViewport
    const overflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"
    let pending = 0
    const update = () => {
      pending = 0
      if (viewport && viewport.scale !== 1) return
      frame.current?.style.setProperty("--coach-height", `${viewport?.height ?? window.innerHeight}px`)
      frame.current?.style.setProperty("--coach-top", `${viewport?.offsetTop ?? 0}px`)
    }
    const schedule = () => {
      if (!pending) pending = requestAnimationFrame(update)
    }
    update()
    viewport?.addEventListener("resize", schedule)
    viewport?.addEventListener("scroll", schedule)
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(pending)
      viewport?.removeEventListener("resize", schedule)
      viewport?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      document.documentElement.style.overflow = overflow
    }
  }, [])

  return (
    <div
      ref={frame}
      className="fixed inset-x-0 top-[var(--coach-top,0px)] h-[var(--coach-height,100dvh)] overflow-hidden md:left-[112px] xl:has-data-[chats=closed]:pl-[76px] xl:has-data-[chats=open]:pl-[284px]"
    >
      {children}
    </div>
  )
}
