"use client"

import { createContext, useContext, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { TAB_ROOT, dayHref, parentHref } from "@/lib/url"

const NavigationContext = createContext<string | null>(null)
const ROOTS = new Set(Object.values(TAB_ROOT))

export function AppNavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const [root, setRoot] = useState<string | null>(null)
  const day = params.get("d")
  const currentRoot = ROOTS.has(pathname) ? `${pathname}${day ? `?d=${encodeURIComponent(day)}` : ""}` : null
  if (currentRoot && currentRoot !== root) setRoot(currentRoot)

  return <NavigationContext.Provider value={currentRoot ?? root}>{children}</NavigationContext.Provider>
}

export function detailBackHref(pathname: string, root: string | null, today: string, day?: string | null, explicit?: string) {
  if (explicit) return explicit
  if (root) return root
  const parent = parentHref(pathname)
  return parent === "/" && day ? dayHref(parent, day, today) : parent
}

export function useAppNavigationRoot() {
  return useContext(NavigationContext)
}
