"use client"

import * as React from "react"

/**
 * A picker row that scrolls sideways on phone. On load and whenever the current metric changes, it scrolls its
 * `aria-current` item to the middle, so the selected section or metric is never left off-screen.
 */
export function PickerStrip({ label, current, className, children }: { label: string; current?: string; className: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    const nav = ref.current
    const item = nav?.querySelector<HTMLElement>("[aria-current]")
    if (!nav || !item || nav.scrollWidth <= nav.clientWidth) return
    const n = nav.getBoundingClientRect()
    const i = item.getBoundingClientRect()
    nav.scrollLeft += i.left - n.left - (n.width - i.width) / 2
  }, [current])
  return (
    <nav ref={ref} aria-label={label} className={className}>
      {children}
    </nav>
  )
}
