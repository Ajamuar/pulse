"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { startSyncing } from "@/lib/sync-activity"
import { Button } from "@/components/ui/button"

/**
 * "Sync now": runs a sync past the worker's 5-minute gate and waits for it, then refreshes the screen.
 * The icon spins while it runs; the outcome is a toast, since the popover or card may have moved on.
 */
export function SyncNowButton({ className, size = "touch" }: { className?: string; size?: "touch" | "sm" }) {
  const router = useRouter()
  // Plain state and a plain fetch, never a Server Action or an async transition: either one holds every link
  // navigation until the sync (20 s or more) returns.
  const [pending, setPending] = React.useState(false)
  const run = async () => {
    setPending(true)
    const end = startSyncing()
    const r: { ok: boolean; error?: string } = await fetch("/sync", { method: "POST", cache: "no-store" })
      .then((res) => res.json())
      .catch(() => ({ ok: false, error: "Couldn’t reach Pulse" }))
      .finally(end)
    setPending(false)
    router.refresh()
    if (r.ok) toast.success("Synced", { id: "sync-now" })
    else toast.error(r.error, { id: "sync-now" })
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size={size === "sm" ? "default" : "touch"}
      onClick={run}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(size === "sm" && "h-9 gap-2 rounded-full px-4 text-[13px] font-semibold", className)}
    >
      <RefreshCw aria-hidden strokeWidth={2} className={cn("transition-transform", pending && "animate-spin motion-reduce:animate-none")} />
      {pending ? "Syncing…" : "Sync now"}
    </Button>
  )
}
