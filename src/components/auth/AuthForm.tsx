"use client"

import * as React from "react"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// The reference app's caps labels over filled dark fields: 48 px tall, 16 px text (no iOS zoom), a 12 px radius.
const LABEL = "text-xs leading-4 font-bold tracking-[0.08em] text-foreground-secondary uppercase"
const INPUT =
  "h-12 w-full min-w-0 rounded-xl bg-secondary px-4 text-[16px] leading-6 text-foreground outline-none ring-1 ring-transparent transition-[box-shadow,background-color] duration-150 ease-standard placeholder:text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-recovery-red/60"

type FieldProps = Omit<React.ComponentProps<"input">, "className"> & {
  label: string
  /** A line under the field: a rule ("At least 10 characters") or where a value comes from. */
  hint?: React.ReactNode
  /** Right of the label: "Forgot password?". */
  aside?: React.ReactNode
}

/** A labelled field; `type="password"` gets a show / hide toggle (no confirm field, the toggle covers typos). */
export function AuthField({ label, hint, aside, id, type, ...props }: FieldProps) {
  const auto = React.useId()
  const fieldId = id ?? auto
  const hintId = hint ? `${fieldId}-hint` : undefined
  const [shown, setShown] = React.useState(false)
  const password = type === "password"
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <label htmlFor={fieldId} className={LABEL}>
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input id={fieldId} type={password && shown ? "text" : type} aria-describedby={hintId} className={cn(INPUT, password && "pr-13")} {...props} />
        {password && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-muted-foreground outline-none transition-[color] duration-150 ease-standard hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {shown ? <EyeOff aria-hidden className="size-5" strokeWidth={1.75} /> : <Eye aria-hidden className="size-5" strokeWidth={1.75} />}
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} className="px-1 text-[13px] leading-[18px] text-pretty text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * A plain form post (works before hydration). The button shows a spinner from submit until the page is left, and
 * resets when the browser restores the page from its back-forward cache.
 */
export function AuthForm({ action, submit, pendingLabel, children }: { action: string; submit: string; pendingLabel: string; children: React.ReactNode }) {
  const [pending, setPending] = React.useState(false)
  React.useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setPending(false)
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])
  return (
    <form method="post" action={action} onSubmit={() => setPending(true)} className="flex flex-col gap-5">
      {children}
      <Button type="submit" size="sheet" disabled={pending} aria-busy={pending || undefined} className="mt-3">
        {pending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" strokeWidth={2.25} />}
        {pending ? pendingLabel : submit}
      </Button>
    </form>
  )
}
