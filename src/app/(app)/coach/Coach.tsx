"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, MessagesSquare, Square, SquarePen } from "lucide-react"
import { cn } from "@/lib/utils"
import type { dayDigest } from "@/server/coach/tools"
import type { ChatGroup } from "@/server/coach/store"
import { Mark } from "@/components/brand/Mark"
import { MiniRing, type MiniRingVariant } from "@/components/metrics/MiniRing"
import { SheetTrigger } from "@/components/shells/SheetTrigger"
import { GLASS } from "@/components/shells/AppNav"
import { Button } from "@/components/ui/button"
import { ChatList } from "./ChatList"
import { Prose } from "./Prose"

type DayDigest = Awaited<ReturnType<typeof dayDigest>>
type Num = { value: number | null; reason?: string }

const SUGGESTIONS = ["Why is my recovery where it is today?", "How did I sleep last night?", "How hard should I train today?", "Which habits help my recovery?"]

/** One line while a tool runs, in the voice of the screen it reads. */
const RUNNING: Record<string, string> = {
  get_day: "Looking at your day…",
  get_trend: "Checking your trends…",
  get_activities: "Looking at your workouts…",
  get_journal_impacts: "Reading your journal…",
  get_health: "Checking your Health Monitor…",
  get_report: "Reading your report…",
  get_profile: "Checking your profile…",
}

const REASON: Record<string, string> = {
  calibrating: "Calibrating",
  no_hrv_last_night: "No HRV",
  awaiting_sleep_sync: "Syncing",
  insufficient_hr_data: "Not enough data",
  band_not_worn: "Not worn",
  no_data: "No data",
}

function Stat({ variant, label, m, unit }: { variant: MiniRingVariant; label: string; m: Num; unit?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <MiniRing variant={variant} value={m.value} />
      <div className="min-w-0">
        <p className="font-numeric text-[17px] leading-5 font-bold tabular-nums">
          {m.value === null ? <span className="text-[13px] font-semibold text-muted-foreground">{REASON[m.reason ?? "no_data"]}</span> : `${m.value}${unit ?? ""}`}
        </p>
        <p className="text-[11px] leading-4 font-bold tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
      </div>
    </div>
  )
}

/** get_day's result as Pulse's own rings and numbers, so the answer can point at them. */
function DayCard({ d }: { d: DayDigest }) {
  const movers = d.recovery.contributors.filter((c) => c.points !== null && Math.abs(c.points) >= 1).sort((a, b) => Math.abs(b.points!) - Math.abs(a.points!)).slice(0, 3)
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card">
      <div className="grid grid-cols-3 gap-2">
        <Stat variant="recovery" label="Recovery" m={d.recovery} unit="%" />
        <Stat variant="sleep" label="Sleep" m={d.sleep.performance} unit="%" />
        <Stat variant="strain" label="Strain" m={d.strain} />
      </div>
      {movers.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-[13px] leading-[18px] text-foreground-secondary">
          {movers.map((c) => (
            <li key={c.label} className="flex justify-between gap-3">
              <span>{c.label}</span>
              <span className={cn("font-numeric font-semibold tabular-nums", c.points! > 0 ? "text-recovery-green" : "text-recovery-red-text")}>
                {c.points! > 0 ? "+" : "−"}
                {Math.abs(c.points!)} pts
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Caption({ live, children }: { live?: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full bg-coach", live && "animate-pulse motion-reduce:animate-none")} />
      {children}
    </p>
  )
}

type Part = UIMessage["parts"][number]

function PartView({ part }: { part: Part }) {
  if (part.type === "text") return <Prose text={part.text} />
  if (!part.type.startsWith("tool-")) return null
  const name = part.type.slice(5)
  const tool = part as Part & { state: string; output?: unknown }
  if (tool.state === "output-error") return <Caption>Couldn’t read that part of your data.</Caption>
  if (tool.state !== "output-available") return <Caption live>{RUNNING[name] ?? "Looking at your data…"}</Caption>
  if (name === "get_day") return <DayCard d={tool.output as DayDigest} />
  return null
}

function Message({ m }: { m: UIMessage }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl bg-secondary px-4 py-2.5 text-[16px] leading-6 whitespace-pre-wrap text-foreground">
          {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
        </p>
      </div>
    )
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-linear-to-br from-insight-from to-insight-to p-px">
        <span className="grid size-full place-items-center rounded-full bg-background">
          <Mark className="size-3.5" />
        </span>
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {m.parts.map((p, i) => (
          <PartView key={i} part={p} />
        ))}
      </div>
    </div>
  )
}

const ERRORS: Record<string, string> = {
  limit: "Slow down a little. Try again in a moment.",
  key: "Your key stopped working. Add it again in Settings › Coach.",
  provider: "Your provider refused the request (key, quota or billing). Check your account with them.",
}

const CHIP =
  "h-10 rounded-full px-4 text-[14px] font-medium text-foreground-secondary ring-1 ring-border outline-none transition-[background-color,color,box-shadow,scale] duration-150 ease-standard hover:bg-foreground/[0.04] hover:text-foreground hover:ring-coach/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"

/**
 * The chat (spec §7.21): the chat list beside the conversation from 1280 px (a Chats link to /coach/chats below it),
 * messages on the ground with the user's in a bubble, tool results as Pulse cards, and the composer pinned to the
 * bottom of the chat column. Sends only the newest message; the server holds the history.
 */
export function Coach({ id, initial, groups, prefill, providerLabel }: { id: string; initial: UIMessage[]; groups: ChatGroup[]; prefill: string; providerLabel: string }) {
  const router = useRouter()
  const [input, setInput] = React.useState(prefill)
  const [error, setError] = React.useState<string | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const end = React.useRef<HTMLDivElement>(null)
  const { messages, sendMessage, status, stop } = useChat({
    id,
    messages: initial,
    throttle: 50,
    transport: new DefaultChatTransport({
      api: "/api/coach",
      prepareSendMessagesRequest: ({ messages, id }) => ({ body: { id, message: messages.at(-1) } }),
    }),
    onError: (e) => setError(ERRORS[/\b(limit|key|provider)\b/.exec(e.message)?.[1] ?? ""] ?? "Couldn’t get an answer. Try again."),
    onFinish: ({ message }) => {
      // Read the finished answer once, as plain words (no ** marks); never re-read a saved chat on load.
      setAnnounce(message.parts.map((p) => (p.type === "text" ? p.text.replace(/\*\*/g, "") : "")).join(" ").trim())
      if (initial.length === 0) router.replace(`/coach?c=${id}`, { scroll: false })
    },
  })
  const [announce, setAnnounce] = React.useState("")
  const busy = status === "submitted" || status === "streaming"

  // A block body: newer browsers' scrollIntoView returns a promise, which React would take for a cleanup.
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [messages.length, status])

  const send = (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setError(null)
    setInput("")
    void sendMessage({ text: t })
    area.current?.focus()
  }

  const chatCount = groups.reduce((n, g) => n + g.chats.length, 0)
  return (
    <div className="xl:grid xl:grid-cols-[264px_minmax(0,1fr)] xl:gap-10">
      <aside className="hidden xl:block">
        <div className="sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pr-1 pb-4">
          <ChatList groups={groups} current={initial.length ? id : null} />
        </div>
      </aside>

      <div className="mx-auto flex min-h-[calc(100svh-11rem)] w-full max-w-[720px] flex-col">
      {/* Phone and tablet: the chat list is its own page; New chat beside it. */}
      <div className="-mt-2 mb-2 flex items-center justify-end gap-1 xl:hidden">
        <Button asChild variant="ghost" className="h-10 gap-2 rounded-full px-3 text-[14px] font-medium text-foreground-secondary hover:text-foreground">
          <Link href="/coach/chats">
            <MessagesSquare aria-hidden className="size-[18px]" strokeWidth={1.75} />
            Chats
            {chatCount > 0 && <span className="font-numeric text-[13px] text-muted-foreground tabular-nums">{chatCount}</span>}
          </Link>
        </Button>
        {messages.length > 0 && (
          <Button asChild variant="ghost" size="icon-touch" aria-label="New chat" className="text-foreground-secondary hover:text-foreground">
            <Link href="/coach">
              <SquarePen aria-hidden strokeWidth={1.75} />
            </Link>
          </Button>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="my-auto flex flex-col items-center py-8 text-center">
          <span aria-hidden className="grid size-14 place-items-center rounded-full bg-linear-to-br from-insight-from to-insight-to p-px">
            <span className="grid size-full place-items-center rounded-full bg-background">
              <Mark className="size-6" />
            </span>
          </span>
          <h2 className="mt-5 text-[24px] leading-8 font-bold tracking-[-0.01em] text-balance">What would you like to know?</h2>
          <p className="mt-2 max-w-[42ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            The coach looks up your own Pulse numbers before it answers, using {providerLabel}. It’s not medical advice.
          </p>
          <div className="mt-7 flex max-w-[560px] flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className={CHIP}>
                {s}
              </button>
            ))}
            <SheetTrigger sheet="checkin" className={CHIP}>
              Check in for today
            </SheetTrigger>
          </div>
        </div>
      ) : (
        <div role="log" aria-label="Chat with Pulse’s coach" className="mt-4 space-y-6">
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          {status === "submitted" && <Caption live>Thinking…</Caption>}
        </div>
      )}

      {/* The finished answer, once, for screen readers (not every token). */}
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-recovery-red/12 px-4 py-3 text-[14px] leading-5 text-foreground">
          {error}
        </p>
      )}

      <div ref={end} className="h-6" />

      {/* Pinned to the bottom of the chat column (not the window), so it lines up with the messages at every width. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className={cn(GLASS, "sticky bottom-[max(calc(env(safe-area-inset-bottom)-6px),12px)] z-20 mt-auto flex items-end gap-2 rounded-[24px] p-1.5 md:bottom-6")}
      >
        <label htmlFor="coach-input" className="sr-only">
          Ask Coach
        </label>
        <textarea
          id="coach-input"
          ref={area}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send(input)
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask Coach"
          className="field-sizing-content max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[18px] bg-field px-4 py-2.5 text-[16px] leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {busy ? (
          <Button type="button" size="icon-touch" variant="secondary" onClick={() => stop()} aria-label="Stop">
            <Square aria-hidden className="fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon-touch" disabled={!input.trim()} aria-label="Send">
            <ArrowUp aria-hidden />
          </Button>
        )}
      </form>
      </div>
    </div>
  )
}
