"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, History, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import type { dayDigest } from "@/server/coach/tools"
import type { ChatGroup } from "@/server/coach/store"
import { Mark } from "@/components/brand/Mark"
import type { MiniRingVariant } from "@/components/metrics/MiniRing"
import { DATA_COLORS, dialColor } from "@/lib/bands"
import { useShellStatus } from "@/components/shells/ShellStatus"
import { UserAvatar } from "@/components/shells/UserAvatar"
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

const MAX: Record<MiniRingVariant, number> = { recovery: 100, sleep: 100, strain: 21 }

/**
 * One score as a tile: the label, the value in its band's colour (or the reason there is none), and a bar filled to
 * where the value sits on its scale. Same data language as Home, at a size that reads beside text.
 */
function Stat({ variant, label, m, unit }: { variant: MiniRingVariant; label: string; m: Num; unit?: string }) {
  const color = m.value === null ? null : DATA_COLORS[dialColor(variant, m.value)]
  return (
    <div className="min-w-0 rounded-xl bg-foreground/[0.035] p-3">
      <p className="text-[12px] leading-4 font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-numeric text-[22px] leading-7 font-bold tabular-nums", color?.text)}>
        {m.value === null ? <span className="text-[14px] leading-7 font-semibold text-foreground-secondary">{REASON[m.reason ?? "no_data"]}</span> : `${m.value}${unit ?? ""}`}
      </p>
      <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
        {m.value !== null && <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (m.value / MAX[variant]) * 100)}%`, background: color?.css }} />}
      </span>
    </div>
  )
}

/** get_day's result as Pulse's own numbers, so the answer can point at them: three scores, then what moved Recovery. */
function DayCard({ d }: { d: DayDigest }) {
  const movers = d.recovery.contributors.filter((c) => c.points !== null && Math.abs(c.points) >= 1).sort((a, b) => Math.abs(b.points!) - Math.abs(a.points!)).slice(0, 3)
  return (
    <div className="rounded-2xl bg-card p-2 shadow-card ring-1 ring-border/60">
      <div className="grid grid-cols-3 gap-2">
        <Stat variant="recovery" label="Recovery" m={d.recovery} unit="%" />
        <Stat variant="sleep" label="Sleep" m={d.sleep.performance} unit="%" />
        <Stat variant="strain" label="Strain" m={d.strain} />
      </div>
      {movers.length > 0 && (
        <div className="px-2 pt-3 pb-1.5">
          <p className="text-[12px] leading-4 font-medium text-muted-foreground">What moved Recovery</p>
          <ul className="mt-1.5 divide-y divide-border text-[14px] leading-5">
            {movers.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-foreground-secondary">{c.label}</span>
                <span className={cn("font-numeric font-semibold tabular-nums", c.points! > 0 ? "text-recovery-green" : "text-recovery-red-text")}>
                  {c.points! > 0 ? "+" : "−"}
                  {Math.abs(c.points!)} {Math.abs(c.points!) === 1 ? "pt" : "pts"}
                </span>
              </li>
            ))}
          </ul>
        </div>
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

/** A 32 px avatar: the person's own photo for their messages, the Pulse mark in the insight ring for the coach's. */
function Avatar({ coach, src }: { coach?: boolean; src?: string | null }) {
  if (!coach)
    return (
      <span aria-hidden className="size-8 shrink-0">
        <UserAvatar src={src} />
      </span>
    )
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-insight-from to-insight-to p-px">
      <span className="grid size-full place-items-center rounded-full bg-background">
        <Mark className="size-4" />
      </span>
    </span>
  )
}

function Message({ m, avatar }: { m: UIMessage; avatar: string | null | undefined }) {
  if (m.role === "user")
    return (
      <div className="flex items-end justify-end gap-2.5">
        <p className="max-w-[80%] rounded-[20px] rounded-br-md bg-secondary px-4 py-2.5 text-[16px] leading-6 whitespace-pre-wrap text-foreground">
          {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
        </p>
        <Avatar src={avatar} />
      </div>
    )
  return (
    <div className="flex gap-2.5">
      <Avatar coach />
      <div className="min-w-0 flex-1 space-y-3 pt-1">
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

// The laptop chat panel's open state, remembered on this device (a viewer convenience: localStorage, never required).
const PANEL_KEY = "pulse:coach-chats-open"
const panelListeners = new Set<() => void>()
function readPanel() {
  try {
    return localStorage.getItem(PANEL_KEY) !== "0"
  } catch {
    return true
  }
}
function setPanelOpen(open: boolean) {
  try {
    localStorage.setItem(PANEL_KEY, open ? "1" : "0")
  } catch {
    // Storage blocked (private window): the toggle still works for this page view.
  }
  panelOpenFallback = open
  panelListeners.forEach((l) => l())
}
let panelOpenFallback: boolean | null = null
const usePanelOpen = () =>
  React.useSyncExternalStore(
    (l) => (panelListeners.add(l), () => panelListeners.delete(l)),
    () => panelOpenFallback ?? readPanel(),
    () => true,
  )

const CHIP =
  "h-10 rounded-full px-4 text-[14px] font-medium text-foreground-secondary ring-1 ring-border outline-none transition-[background-color,color,box-shadow,scale] duration-150 ease-standard hover:bg-foreground/[0.04] hover:text-foreground hover:ring-coach/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"

/**
 * The chat (spec §7.21): the chat list beside the conversation from 1280 px (a Chats link to /coach/chats below it),
 * messages on the ground with the user's in a bubble, tool results as Pulse cards, and the composer pinned to the
 * bottom of the chat column. Sends only the newest message; the server holds the history.
 */
export function Coach({ id, initial, groups, prefill, providerLabel }: { id: string; initial: UIMessage[]; groups: ChatGroup[]; prefill: string; providerLabel: string }) {
  const router = useRouter()
  const { avatar } = useShellStatus()
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
  const listOpen = usePanelOpen()
  const ICON_BTN = "text-foreground-secondary hover:text-foreground"
  const newChat = (
    <Button asChild variant="ghost" size="icon-touch" aria-label="New chat" className={ICON_BTN}>
      <Link href="/coach">
        <MessageSquarePlus aria-hidden strokeWidth={1.75} />
      </Link>
    </Button>
  )
  return (
    // Cancels AppShell's bottom padding (room for the phone tab bar, which this screen hides), so the composer rests
    // on the screen's bottom edge, above the safe area, with no gap under it.
    <div className={cn("-mb-[calc(62px+max(env(safe-area-inset-bottom)-6px,12px)+24px)] md:-mb-10 xl:grid xl:gap-8", listOpen ? "xl:grid-cols-[280px_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)]")}>
      {/* Laptop: the chats as a collapsible panel beside the conversation (remembered per device). */}
      {listOpen && (
        <aside aria-label="Chats panel" className="hidden xl:block">
          <div className="sticky top-20 flex max-h-[calc(100svh-7rem)] flex-col rounded-2xl bg-card shadow-card ring-1 ring-border">
            <div className="flex items-center justify-between gap-1 border-b border-border py-2 pr-2 pl-4">
              <h2 className="text-[15px] font-semibold">Chats</h2>
              <span className="flex items-center">
                {newChat}
                <Button variant="ghost" size="icon-touch" aria-label="Hide chats" aria-expanded onClick={() => setPanelOpen(false)} className={ICON_BTN}>
                  <PanelLeftClose aria-hidden strokeWidth={1.75} />
                </Button>
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <ChatList groups={groups} current={initial.length ? id : null} showNew={false} />
            </div>
          </div>
        </aside>
      )}

      <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-[760px] flex-col pb-[max(env(safe-area-inset-bottom),12px)] md:pb-6">
      {/* The chat's toolbar: the chats (a page below 1280 px, the panel's toggle from there) and New chat. */}
      <div className="-mt-2 mb-2 flex items-center justify-between gap-1">
        <span className="flex items-center">
          <Button asChild variant="ghost" size="icon-touch" aria-label={chatCount ? `Chats (${chatCount})` : "Chats"} className={cn(ICON_BTN, "xl:hidden")}>
            <Link href="/coach/chats">
              <History aria-hidden strokeWidth={1.75} />
            </Link>
          </Button>
          {!listOpen && (
            <Button variant="ghost" size="icon-touch" aria-label="Show chats" aria-expanded={false} onClick={() => setPanelOpen(true)} className={cn(ICON_BTN, "hidden xl:inline-flex")}>
              <PanelLeftOpen aria-hidden strokeWidth={1.75} />
            </Button>
          )}
        </span>
        {(messages.length > 0 || !listOpen) && <span className={cn(listOpen && "xl:hidden")}>{newChat}</span>}
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
            <Message key={m.id} m={m} avatar={avatar} />
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
        className={cn(GLASS, "sticky bottom-[max(env(safe-area-inset-bottom),12px)] z-20 mt-auto flex items-end gap-2 rounded-[24px] p-1.5 md:bottom-6")}
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
          className="field-sizing-content max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[18px] bg-field px-4 py-2.5 text-[16px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
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
