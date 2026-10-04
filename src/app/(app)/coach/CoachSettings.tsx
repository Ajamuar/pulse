"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { ActionResult } from "@/server/actions/journal"
import { deleteAllChatsAction, removeProviderAction, setConsentAction } from "@/server/actions/coach"
import type { ProviderOption } from "@/server/coach/options"
import type { CoachSetup } from "@/server/coach/store"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { SectionShell } from "@/components/shells/SectionShell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProviderForm } from "./CoachSetup"

const ROW = "flex min-h-13 items-center justify-between gap-3 py-2"

/**
 * Settings › Coach: the provider and model, the key as ••••last4 only, and the controls to change or remove it,
 * turn the coach off (consent) or delete every chat.
 */
export function CoachSettings({ setup, providers, providerLabel }: { setup: CoachSetup; providers: ProviderOption[]; providerLabel: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, start] = React.useTransition()
  const [confirm, setConfirm] = React.useState<null | "chats" | "off">(null)
  const act = (p: () => Promise<ActionResult>, ok: string, done?: () => void) =>
    start(async () => {
      const r = await p().catch((): ActionResult => ({ ok: false, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
      done?.()
      toast.success(ok)
      router.refresh()
    })
  return (
    <SectionShell variant="card" level={2} id="coach" title="Coach">
      {!setup.consent ? (
        <div className={ROW}>
          <span className="text-[15px] leading-[22px] text-foreground-secondary">Off</span>
          <Button asChild variant="secondary" size="touch">
            <Link href="/coach">Set up</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            <div className={ROW}>
              <span className="text-[15px] leading-[22px]">Provider</span>
              <span className="truncate text-right text-[15px] leading-[22px] text-foreground-secondary">{(setup.provider && providers.find((p) => p.id === setup.provider)?.label) ?? (setup.provider ? providerLabel : "Not set")}</span>
            </div>
            {setup.model && (
              <div className={ROW}>
                <span className="text-[15px] leading-[22px]">Model</span>
                <span className="truncate text-right font-numeric text-[15px] leading-[22px] text-foreground-secondary">{setup.model}</span>
              </div>
            )}
            {setup.last4 && (
              <div className={ROW}>
                <span className="text-[15px] leading-[22px]">API key</span>
                <span className="flex items-center gap-3">
                  <span className="font-numeric text-[15px] leading-[22px] text-foreground-secondary tabular-nums">••••{setup.last4}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(removeProviderAction, "Key removed.")}
                    className="relative rounded-md text-[13px] font-semibold text-recovery-red-text outline-none after:absolute after:-inset-3 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Remove
                  </button>
                </span>
              </div>
            )}
          </div>
          {/* One row of three: change the provider, clear the chats, or turn the coach off. */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button variant="secondary" size="touch" className="px-1.5 text-[12px] tracking-[0.03em]" onClick={() => setOpen(true)} disabled={pending}>
              {setup.provider ? "Change" : "Add key"}
            </Button>
            <Button variant="outline" size="touch" className="px-1.5 text-[12px] tracking-[0.03em]" disabled={pending} onClick={() => setConfirm("chats")}>
              Delete chats
            </Button>
            <Button variant="outline" size="touch" className="px-1.5 text-[12px] tracking-[0.03em]" disabled={pending} onClick={() => setConfirm("off")}>
              Turn off
            </Button>
          </div>
          <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">Your key is encrypted on this server and never shown again. Admins can’t see it or your chats.</p>
        </>
      )}
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="AI provider">
        <ProviderForm providers={providers} current={setup} onSaved={() => (setOpen(false), toast.success("Provider saved."))} />
      </ResponsiveSheet>
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>{confirm === "chats" ? "Delete every coach chat?" : "Turn the coach off?"}</DialogTitle>
            <DialogDescription>
              {confirm === "chats"
                ? "All your saved chats are removed from this server. This can’t be undone."
                : "The coach stops until you set it up again. Your key and chats stay; delete them here first if you want them gone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" size="touch" onClick={() => setConfirm(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className={confirm === "chats" ? "text-recovery-red-text" : undefined}
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={() =>
                confirm === "chats"
                  ? act(deleteAllChatsAction, "Every chat deleted.", () => setConfirm(null))
                  : act(() => setConsentAction(false), "Coach turned off.", () => setConfirm(null))
              }
            >
              {confirm === "chats" ? "Delete chats" : "Turn off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionShell>
  )
}
