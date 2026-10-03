import { Suspense } from "react"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { currentSession } from "@/server/auth"
import { AppShell } from "@/components/shells/AppShell"
import { CheckInSheet } from "./journal/CheckIn"
import { avatarSrc } from "@/server/avatar"
import { getDb } from "@/server/db"
import { getShellStatus, requestSync } from "@/server/queries/settings"

// Drops Next's generated manifest link (no crossorigin outside Vercel previews), leaving the root
// layout's own <link crossorigin="use-credentials"> as the only one.
export const metadata = { manifest: null }

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Request time only: the status, "today" and the config must never be frozen into a prerender
  // (and getConfig() throws at build time without an .env).
  await connection()
  // The proxy is the main gate; this backs it up for any path its matcher leaves out.
  if (!(await currentSession())) redirect("/login")
  // Fire and forget: the worker throttles itself; the page renders from what is already stored.
  requestSync()
  return (
    <AppShell live status={{ ...getShellStatus(), avatar: avatarSrc(getDb()) }}>
      {children}
      {/* One check-in sheet for every screen, opened over it by `?checkin=1` (spec §11 UX2). */}
      <Suspense>
        <CheckInSheet />
      </Suspense>
    </AppShell>
  )
}
