"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Pencil } from "lucide-react"
import { toast } from "sonner"
import { cn, moved } from "@/lib/utils"
import { DASHBOARD_KEYS, DASHBOARD_LABEL, type DashboardKey } from "@/lib/dashboard"
import { saveDashboard } from "@/server/actions/dashboard"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { STAT_ICON } from "./view"

type Item = { key: DashboardKey; shown: boolean }

/** The chosen metrics in order, then the rest in catalogue order, switched off. */
const itemsOf = (keys: DashboardKey[]): Item[] => [
  ...keys.map((key) => ({ key, shown: true })),
  ...DASHBOARD_KEYS.filter((k) => !keys.includes(k)).map((key) => ({ key, shown: false })),
]
const isDefault = (items: Item[]) => items.every((it, i) => it.shown && it.key === DASHBOARD_KEYS[i])

/**
 * Home › My Dashboard's pencil (spec §11 CD1, the reference app's "pencil icon on the right of the section header"): switch metrics
 * on or off and move them up or down, then Save. Reset to default restores the full list in its first order.
 */
export function EditDashboard({ keys }: { keys: DashboardKey[] }) {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState(() => itemsOf(keys))
  const [saving, setSaving] = React.useState(false)
  const [status, setStatus] = React.useState("")
  const shown = items.filter((it) => it.shown).length

  const start = () => {
    setItems(itemsOf(keys))
    setStatus("")
    setOpen(true)
  }
  const move = (i: number, by: -1 | 1) => {
    const next = moved(items, i, by)
    setItems(next)
    setStatus(`${DASHBOARD_LABEL[items[i].key]} moved to position ${i + by + 1} of ${items.length}`)
  }
  const save = async () => {
    setSaving(true)
    const r = await saveDashboard({ keys: items.filter((it) => it.shown).map((it) => it.key) }).catch(() => ({ ok: false as const, error: "network" }))
    setSaving(false)
    if (!r.ok) return void toast.error("Couldn’t save your dashboard. Try again.")
    setOpen(false)
    toast.success("Dashboard saved")
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Edit My Dashboard"
        onClick={start}
        className="relative rounded-full text-foreground-secondary after:absolute after:-inset-1.5 hover:bg-white/[0.06] hover:text-foreground"
      >
        <Pencil aria-hidden strokeWidth={1.75} className="size-[18px]" />
      </Button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="My Dashboard"
        description="Choose the metrics on Home and their order."
        size="tall"
        footer={
          <>
            <Button size="sheet" onClick={save} disabled={saving || shown === 0} aria-describedby={shown === 0 ? "dashboard-none" : undefined}>
              {saving ? "Saving…" : "Save dashboard"}
            </Button>
            <Button size="sheet" variant="outline-pill" onClick={() => setItems(itemsOf(DASHBOARD_KEYS))} disabled={saving || isDefault(items)}>
              Reset to default
            </Button>
          </>
        }
      >
        <h3 className={cn(SHEET_SECTION, "mt-2")}>
          Metrics <span className="font-numeric tabular-nums">{`${shown} of ${items.length}`}</span>
        </h3>
        {shown === 0 && (
          <p id="dashboard-none" role="alert" className="mt-3 text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            Turn on at least one metric to save.
          </p>
        )}
        <ul>
          {items.map((it, i) => {
            const label = DASHBOARD_LABEL[it.key]
            const id = `dashboard-${it.key}`
            return (
              <li key={it.key} className="flex min-h-14 items-center gap-1 border-b border-border">
                <span aria-hidden className={cn("mr-2 shrink-0 text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]", !it.shown && "opacity-50")}>
                  {STAT_ICON[it.key]}
                </span>
                <Label htmlFor={id} className={cn("min-w-0 flex-1 text-[15px] leading-[22px] font-normal text-balance", !it.shown && "text-muted-foreground")}>
                  {label}
                </Label>
                <Button variant="ghost" size="icon-touch" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp strokeWidth={1.75} />
                </Button>
                <Button variant="ghost" size="icon-touch" aria-label={`Move ${label} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown strokeWidth={1.75} />
                </Button>
                <Switch
                  id={id}
                  checked={it.shown}
                  onCheckedChange={(on) => setItems(items.map((x) => (x.key === it.key ? { ...x, shown: on } : x)))}
                  aria-label={`Show ${label} on Home`}
                  className="ml-1"
                />
              </li>
            )
          })}
        </ul>
        <p role="status" className="sr-only">
          {status}
        </p>
      </ResponsiveSheet>
    </>
  )
}
