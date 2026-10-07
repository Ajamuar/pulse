"use client"

import { useLayoutEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { TAB_ROOT, tabForPath } from "@/lib/url"

const ROOTS = new Set(Object.values(TAB_ROOT))
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)" // --ease-out-expo

type Motion = { keyframes: Keyframe[]; duration: number }

const slide = (dx: number): Motion => ({
  keyframes: [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: "none" }],
  duration: 340,
})
const fade = (duration: number, from = 0): Motion => ({ keyframes: [{ opacity: from }, { opacity: 1 }], duration })

/**
 * How a screen arrives, from where the user came from: deeper slides in from the right, back to the tab's root slides
 * in from the left, another tab fades through, and the same screen (its skeleton handing over to the content) fades.
 * Exported for the test.
 */
export function motionFor(from: string | null, to: string, reduce: boolean): Motion | null {
  if (from === null) return null // the launch: the splash screen hands over, nothing to animate
  if (from === to) return fade(180, 0.4)
  if (reduce) return fade(150)
  const sameTab = tabForPath(from) === tabForPath(to)
  if (ROOTS.has(to)) {
    if (sameTab) return slide(-48)
    return {
      keyframes: [{ opacity: 0, transform: "scale(0.985)" }, { opacity: 1, transform: "none" }],
      duration: 260,
    }
  }
  if (from.startsWith(`${to}/`)) return slide(-48)
  return slide(48)
}

// The screen whose content last came in, and how. Module scope, so it outlives the page that unmounts on navigation.
let shown: string | null = null
let last: { m: Motion; at: number } | null = null
const entered = new WeakSet<Element>()

/**
 * The content column of a screen, animated in on navigation. Only the column moves: the sticky header and the glass
 * nav stay put (snapshotting them for a View Transition made the glass flicker, docs/pwa.md). Transform and opacity
 * only, on the compositor; nothing is left on the element afterwards, so sticky and fixed children behave as before.
 */
export function PageEnter(props: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  useLayoutEffect(() => {
    // Strict Mode runs this twice on one element; the second run must not swap the slide for a fade.
    if (!ref.current || entered.has(ref.current)) return
    entered.add(ref.current)
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    const now = performance.now()
    // The content replacing its skeleton mid-slide picks the slide up where the skeleton left it, instead of jumping.
    if (shown === pathname && last && now - last.at < last.m.duration) {
      ref.current.animate(last.m.keyframes, { duration: last.m.duration, easing: EASE_OUT }).currentTime = now - last.at
      return
    }
    const m = motionFor(shown, pathname, reduce)
    shown = pathname
    last = m && { m, at: now }
    if (m) ref.current.animate(m.keyframes, { duration: m.duration, easing: EASE_OUT })
    // Mount only: a day change (?d=) re-renders the same column and has its own dimming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={ref} {...props} />
}
