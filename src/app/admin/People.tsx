"use client"

import * as React from "react"
import { Search } from "lucide-react"
import type { AccountRow } from "@/server/admin"
import { cn } from "@/lib/utils"
import { CoachSwitch } from "./AdminClient"
import { PersonActions } from "./PersonPanel"
import { Pill, relative, TD, TH } from "./ui"

/** Account rows as the browser gets them: dates as epoch ms. */
export type Person = Omit<AccountRow, "createdAt" | "lastSeen"> & { createdAt: number; lastSeen: number | null }

const WEEK = 7 * 86_400_000
const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "admins", label: "Admins" },
  { key: "active", label: "Active this week" },
  { key: "google", label: "No Google yet" },
  { key: "coach", label: "Coach set up" },
] as const
type Filter = (typeof FILTERS)[number]["key"]

const ROLE = { owner: "Owner", admin: "Admin", user: "Member" } as const

/**
 * Everyone on the server: search by name, username or email; filter; and per person make or remove admin, pick for
 * the coach (when access is "chosen") or delete. Owners (ADMIN_EMAILS) and you have no menu.
 */
export function People({ people, me, now, chosen, canReset }: { people: Person[]; me: number; now: number; chosen: boolean; canReset: boolean }) {
  const [q, setQ] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("all")
  const needle = q.trim().toLowerCase()
  const shown = people.filter((p) => {
    if (needle && ![p.name, p.username ?? "", p.email].some((s) => s.toLowerCase().includes(needle))) return false
    if (filter === "admins") return p.role !== "user"
    if (filter === "active") return p.lastSeen !== null && now - p.lastSeen < WEEK
    if (filter === "google") return !p.google
    if (filter === "coach") return p.coachReady
    return true
  })
  const count = (f: Filter) =>
    f === "all" ? people.length : people.filter((p) => (f === "admins" ? p.role !== "user" : f === "active" ? p.lastSeen !== null && now - p.lastSeen < WEEK : f === "google" ? !p.google : p.coachReady)).length

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label="Show" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50",
                filter === f.key ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              {f.label}
              <span className="font-numeric text-[12px] text-muted-foreground tabular-nums">{count(f.key)}</span>
            </button>
          ))}
        </div>
        <label className="relative block md:w-64">
          <span className="sr-only">Search people</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            placeholder="Search people"
            className="h-10 w-full rounded-lg bg-secondary pr-3 pl-9 text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[14px] text-muted-foreground">{needle ? `No one matches “${q.trim()}”.` : "No one here."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={TH}>Person</th>
                <th scope="col" className={TH}>Role</th>
                <th scope="col" className={TH}>Joined</th>
                <th scope="col" className={TH}>Last active</th>
                <th scope="col" className={TH}>Google</th>
                <th scope="col" className={TH}>Coach</th>
                <th scope="col" className={cn(TH, "text-right")}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((p) => (
                <tr key={p.id} className="transition-[background-color] duration-150 hover:bg-foreground/[0.02]">
                  <td className={TD}>
                    <span className="flex items-center gap-3">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-[13px] font-semibold">
                        {p.name.trim()[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[240px] truncate font-medium">
                          {p.name}
                          {p.id === me && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">(you)</span>}
                        </span>
                        <span className="block max-w-[240px] truncate text-[13px] leading-[18px] text-muted-foreground">
                          {p.username ? `@${p.username} · ` : ""}
                          {p.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={TD}>
                    <Pill tone={p.role === "user" ? "neutral" : "coach"}>{ROLE[p.role]}</Pill>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{relative(p.createdAt, now)}</td>
                  <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{p.lastSeen ? relative(p.lastSeen, now) : "Signed out"}</td>
                  <td className={TD}>{p.google ? <Pill tone="good">Connected</Pill> : <Pill>Not yet</Pill>}</td>
                  <td className={TD}>
                    {chosen && p.role !== "owner" ? (
                      <CoachSwitch id={p.id} name={p.name} allowed={p.coachAllowed} />
                    ) : p.coachReady ? (
                      <Pill tone="coach">Set up</Pill>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">Not set up</span>
                    )}
                  </td>
                  <td className={cn(TD, "text-right")}>{p.role === "owner" ? <span className="text-[13px] text-muted-foreground">Set in .env</span> : p.id === me ? <span className="text-[13px] text-muted-foreground">You</span> : <PersonActions person={p} now={now} chosen={chosen} canReset={canReset} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
        Showing {shown.length} of {people.length}
      </p>
    </div>
  )
}
