"use client"

import * as React from "react"
import { Check, Copy, Ellipsis } from "lucide-react"
import { toast } from "sonner"
import { createInviteAction, deleteAccountAction, revokeInviteAction, setCoachAllowedAction, setCoachModeAction, setRoleAction, setSignupModeAction } from "@/server/actions/admin"
import type { ActionResult } from "@/server/actions/journal"
import type { SignupMode } from "@/server/admin"
import type { CoachMode } from "@/server/coach/store"
import { Switch } from "@/components/ui/switch"
import { AuthField } from "@/components/auth/AuthForm"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/** Runs an action and toasts its error; a dropped connection is an error too, never a thrown error screen. */
const run = async <T,>(p: Promise<ActionResult<T>>): Promise<{ data: T } | null> => {
  const r = await p.catch((): ActionResult<T> => ({ ok: false, error: "Couldn’t reach Pulse. Try again." }))
  if (r.ok) return r
  toast.error(r.error)
  return null
}

const MODES = {
  signup: {
    label: "Who can sign up",
    options: [
      { mode: "invite", label: "Invite only" },
      { mode: "open", label: "Open" },
      { mode: "closed", label: "Closed" },
    ],
    save: (m: string) => setSignupModeAction(m as SignupMode),
  },
  coach: {
    label: "Who can use the coach",
    options: [
      { mode: "off", label: "Off" },
      { mode: "everyone", label: "Everyone" },
      { mode: "chosen", label: "Chosen" },
    ],
    save: (m: string) => setCoachModeAction(m as CoachMode),
  },
}

/** A server-wide three-way setting, saved at once, as Journal Insights' outcome toggle switches at once. */
export function ModeToggle({ kind, mode }: { kind: keyof typeof MODES; mode: string }) {
  const { label, options, save } = MODES[kind]
  const [value, setValue] = React.useState(mode)
  const [pending, start] = React.useTransition()
  const change = (v: string) => {
    if (!options.some((o) => o.mode === v) || v === value) return
    setValue(v)
    start(async () => {
      if (!(await run(save(v)))) setValue(mode)
    })
  }
  return (
    <ToggleGroup type="single" value={value} onValueChange={change} disabled={pending} spacing={0} aria-label={label} className="grid w-full grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((m) => (
        <ToggleGroupItem
          key={m.mode}
          value={m.mode}
          className="h-10 rounded-md! px-3 text-[13px] font-bold tracking-[0.06em] text-muted-foreground uppercase transition-[background-color,color] duration-150 ease-standard hover:bg-transparent hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground"
        >
          {m.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** An account's coach switch (Coach = chosen accounts). */
export function CoachSwitch({ id, name, allowed }: { id: number; name: string; allowed: boolean }) {
  const [on, setOn] = React.useState(allowed)
  const [pending, start] = React.useTransition()
  return (
    <label className="flex items-center gap-2 text-[13px] leading-[18px] text-foreground-secondary">
      <Switch
        checked={on}
        disabled={pending}
        aria-label={`Coach for ${name}`}
        onCheckedChange={(v) => {
          setOn(v)
          start(async () => {
            if (!(await run(setCoachAllowedAction(id, v)))) setOn(!v)
          })
        }}
      />
      Coach
    </label>
  )
}

/** Who it's for (optional), then Create; the new link shows once, with Copy. */
export function NewInvite() {
  const [pending, start] = React.useTransition()
  const [link, setLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const label = String(new FormData(form).get("label") ?? "")
    start(async () => {
      const r = await run(createInviteAction(label))
      if (!r) return
      form.reset()
      setCopied(false)
      setLink(`${window.location.origin}/signup?invite=${r.data}`)
    })
  }
  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      toast.error("Couldn’t copy. Select the link and copy it.")
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <AuthField label="For (optional)" name="label" maxLength={60} placeholder="Sam" autoComplete="off" />
        </div>
        <Button type="submit" size="touch" disabled={pending} aria-busy={pending || undefined} className="h-12">
          {pending ? "Creating…" : "Create link"}
        </Button>
      </form>
      {link && (
        <div role="status" className="rounded-xl bg-foreground/[0.04] p-3">
          <p className="text-[13px] leading-[18px] text-foreground-secondary">Send this link. It won’t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-lg bg-secondary px-3 font-numeric text-[13px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
            <Button type="button" variant="secondary" size="icon-touch" onClick={copy} aria-label={copied ? "Copied" : "Copy link"}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function RevokeInvite({ id, label }: { id: number; label: string }) {
  const [pending, start] = React.useTransition()
  return (
    <Button
      variant="ghost"
      disabled={pending}
      aria-label={`Revoke ${label}`}
      onClick={() => start(async () => void (await run(revokeInviteAction(id))))}
      className="h-10 rounded-full px-4 text-[13px] font-semibold text-muted-foreground hover:bg-foreground/[0.06] hover:text-recovery-red-text"
    >
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  )
}

/** Make or remove admin, and delete the account (with a confirmation naming what goes). */
export function AccountActions({ id, name, admin }: { id: number; name: string; admin: boolean }) {
  const [pending, start] = React.useTransition()
  const [confirm, setConfirm] = React.useState(false)
  const role = () => start(async () => void (await run(setRoleAction(id, admin ? "user" : "admin"))))
  const remove = () =>
    start(async () => {
      if (await run(deleteAccountAction(id))) {
        setConfirm(false)
        toast.success(`${name}’s account was deleted.`)
      }
    })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-touch" disabled={pending} aria-label={`Actions for ${name}`}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={role}>{admin ? "Remove admin" : "Make admin"}</DropdownMenuItem>
          {!admin && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
              Delete account…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={(o) => !pending && setConfirm(o)}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Delete {name}’s account?</DialogTitle>
            <DialogDescription>
              Removes the account and everything Pulse stored for it: synced data, scores, journal, profile and the Google connection. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" size="touch" onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="outline" size="touch" className="text-recovery-red-text" onClick={remove} disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Deleting…" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
