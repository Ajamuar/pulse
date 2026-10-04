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
  const act = (p: () => Promise<ActionResult>, ok: string) =>
    start(async () => {
      const r = await p().catch((): ActionResult => ({ ok: false, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
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
              <span className="truncate text-right text-[15px] leading-[22px] text-foreground-secondary">{setup.provider ? providerLabel : "Not set"}</span>
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
                <span className="font-numeric text-[15px] leading-[22px] text-foreground-secondary tabular-nums">••••{setup.last4}</span>
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="touch" onClick={() => setOpen(true)} disabled={pending}>
              {setup.provider ? "Change" : "Add key"}
            </Button>
            {setup.provider && (
              <Button variant="outline" size="touch" disabled={pending} onClick={() => act(removeProviderAction, "Key removed.")}>
                Remove key
              </Button>
            )}
            <Button variant="outline" size="touch" disabled={pending} onClick={() => act(deleteAllChatsAction, "Every chat deleted.")}>
              Delete chats
            </Button>
            <Button variant="outline" size="touch" disabled={pending} onClick={() => act(() => setConsentAction(false), "Coach turned off.")}>
              Turn off
            </Button>
          </div>
          <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">Your key is encrypted on this server and never shown again. Admins can’t see it or your chats.</p>
        </>
      )}
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="AI provider" description="Pulse checks the key with one tiny request before saving it.">
        <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] md:px-6 md:pb-6">
          <ProviderForm providers={providers} current={setup} onSaved={() => (setOpen(false), toast.success("Provider saved."))} />
        </div>
      </ResponsiveSheet>
    </SectionShell>
  )
}
