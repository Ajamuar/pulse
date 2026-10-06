"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Activity, ArrowUp, Check, ChevronRight, Copy, Dumbbell, History, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, Pencil, RotateCcw, Settings2, Square, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { dayDigest } from "@/server/coach/tools"
import type { ChatCursor, ChatGroup } from "@/server/coach/store"
import { Mark } from "@/components/brand/Mark"
import type { MiniRingVariant } from "@/components/metrics/MiniRing"
import { DATA_COLORS, dialColor } from "@/lib/bands"
import { SheetTrigger } from "@/components/shells/SheetTrigger"
import { GLASS } from "@/components/shells/AppNav"
import { Button } from "@/components/ui/button"
import { CARD_MATERIAL } from "@/components/ui/card"
import { ChatList, NewChatButton } from "./ChatList"
import { Prose } from "./Prose"

import type { CoachSuggestion } from "@/core/algorithms/coachSuggestions"
import { Evidence } from "./Evidence"

type DayDigest = Awaited<ReturnType<typeof dayDigest>>
type Num = { value: number | null; reason?: string | null }

const SUGGESTION_ICONS: Record<CoachSuggestion["key"], LucideIcon> = {
  brief: Activity, recovery: Activity, training: Dumbbell, hrv: Activity, sleep: Moon, strain: Dumbbell, sync: Moon,
}

/** One line while a tool runs, in the voice of the screen it reads. */
const RUNNING: Record<string, string> = {
  get_day: "Looking at your day…",
  get_sleep: "Reading your sleep and bedtime plan…",
  get_activity: "Checking workout intensity…",
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
    <div className="min-w-0 rounded-md bg-foreground/[0.035] p-3">
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
    <div className={cn(CARD_MATERIAL, "p-2")}>
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
  if (name === "get_day") return <div className="space-y-2"><DayCard d={tool.output as DayDigest} /><Evidence name={name} output={tool.output} /></div>
  return <Evidence name={name} output={tool.output} />
}

/** The answer as plain words (no ** marks), for the clipboard and the screen-reader announcement. */
const plain = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text.replace(/\*\*/g, "") : ""))
    .join("\n\n")
    .trim()

/** A message action (Copy, Regenerate, Edit): a quiet 36 px icon button, 40 px on touch screens. */
const ACTION = "relative text-muted-foreground hover:text-foreground pointer-coarse:size-10"
/** Shown on hover or focus of its message with a mouse; always on touch screens, which have no hover. */
const REVEAL = "transition-[opacity,background-color,color] pointer-fine:opacity-0 pointer-fine:group-hover/msg:opacity-100 pointer-fine:group-focus-within/msg:opacity-100 pointer-fine:disabled:invisible"

/** Copy an answer: the icon cross-fades to a check for a moment (both stay in the DOM, so it animates both ways). */
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const ICON = "absolute size-4 transition-[opacity,scale,filter] duration-200 ease-standard motion-reduce:transition-none"
  return (
    <Button type="button" variant="ghost" size="icon-lg" aria-label={copied ? "Copied" : "Copy answer"} onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})} className={ACTION}>
      <Copy aria-hidden strokeWidth={1.75} className={cn(ICON, copied && "scale-25 opacity-0 blur-[4px]")} />
      <Check aria-hidden strokeWidth={2} className={cn(ICON, !copied && "scale-25 opacity-0 blur-[4px]")} />
    </Button>
  )
}

/** The user's message: a bubble with Edit beside it, which turns it into a field (Enter saves, Escape cancels). */
function UserMessage({ m, busy, onEdit }: { m: UIMessage; busy: boolean; onEdit: (text: string) => void }) {
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
  const [draft, setDraft] = React.useState<string | null>(null)
  const editId = `edit-${m.id}`
  const save = () => {
    const t = draft?.trim()
    if (!t || busy) return
    setDraft(null)
    if (t !== text.trim()) onEdit(t)
  }
  if (draft !== null)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="ml-10 space-y-2 md:ml-16"
      >
        <label htmlFor={editId} className="sr-only">
          Edit your message
        </label>
        <textarea
          id={editId}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              setDraft(null)
            } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              save()
            }
          }}
          rows={1}
          maxLength={2000}
          className="field-sizing-content block max-h-60 min-h-11 w-full resize-none rounded-[20px] bg-secondary px-4 py-2.5 text-[16px] leading-6 text-foreground caret-coach ring-1 ring-foreground/20 outline-none focus-visible:ring-foreground/35 md:text-[15px]"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDraft(null)} className="h-9 rounded-full px-4 text-[13px] font-semibold pointer-coarse:h-10">
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !draft.trim()} className="h-9 rounded-full px-4 text-[13px] font-semibold pointer-coarse:h-10">
            Save and send
          </Button>
        </div>
      </form>
    )
  return (
    <div className="group/msg flex items-start justify-end gap-1 pl-6 md:pl-12">
      <Button type="button" variant="ghost" size="icon-lg" aria-label="Edit message" disabled={busy} onClick={() => setDraft(text)} className={cn(ACTION, REVEAL, "mt-0.5 shrink-0")}>
        <Pencil aria-hidden strokeWidth={1.75} className="size-4" />
      </Button>
      <p className="min-w-0 rounded-[20px] rounded-br-md bg-secondary px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap text-foreground">{text}</p>
    </div>
  )
}

/** The coach's answer: its parts, then Copy (and Regenerate on the newest answer) once it has finished. */
function AssistantMessage({ m, done, onRegenerate }: { m: UIMessage; done: boolean; onRegenerate?: () => void }) {
  const text = plain(m)
  return (
    <div className="min-w-0 space-y-3">
      {m.parts.map((p, i) => (
        <PartView key={i} part={p} />
      ))}
      {done && (text || onRegenerate) && (
        <div className="-ml-2 flex items-center">
          {text && <CopyAnswer text={text} />}
          {onRegenerate && (
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Regenerate answer" onClick={onRegenerate} className={ACTION}>
              <RotateCcw aria-hidden strokeWidth={1.75} className="size-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * How far the on-screen keyboard covers the layout viewport's bottom edge (0 without one), so the composer can sit
 * on top of it. Phone browsers that overlay the keyboard (iOS, Android's default) would otherwise hide it.
 */
function useKeyboardInset() {
  const [inset, setInset] = React.useState(0)
  React.useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])
  return inset
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

/** A starter question: the app's card row (icon, label, chevron), as on More and Settings. */
const SUGGESTION = cn(
  CARD_MATERIAL,
  "group/suggestion flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[14px] leading-5 font-medium text-foreground outline-none transition-[scale,--tw-gradient-from] duration-150 ease-standard hover:from-card-hover focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
)

/**
 * The chat (spec §7.21): the chat list beside the conversation from 1280 px (a Chats link to /coach/chats below it),
 * messages on the ground with the user's in a bubble, tool results as Pulse cards, and the composer pinned to the
 * bottom of the chat column. Sends only the newest message; the server holds the history.
 */
/** The chat's actions below 1280 px, in the page header so they stay put (from 1280 px the chats panel carries all three). */
export function CoachBarActions({ chatCount, chatOpen }: { chatCount: number; chatOpen: boolean }) {
  const btn = "text-foreground-secondary hover:text-foreground"
  return (
    <span className="flex items-center xl:hidden">
      <Button asChild variant="ghost" size="icon-touch" aria-label={chatCount ? `Chats (${chatCount})` : "Chats"} className={btn}>
        <Link href="/coach/chats">
          <History aria-hidden strokeWidth={1.75} />
        </Link>
      </Button>
      {chatOpen && <NewChatButton />}
      <Button asChild variant="ghost" size="icon-touch" aria-label="Coach settings" className={btn}>
        <Link href="/settings#coach">
          <Settings2 aria-hidden strokeWidth={1.6} />
        </Link>
      </Button>
    </span>
  )
}

export function Coach({ id, initial, groups, next, prefill, auto, providerLabel, suggestions }: { id: string; initial: UIMessage[]; groups: ChatGroup[]; next: ChatCursor | null; prefill: string; auto: boolean; providerLabel: string; suggestions: CoachSuggestion[] }) {
  const router = useRouter()
  const [input, setInput] = React.useState(prefill)
  const [error, setError] = React.useState<string | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const end = React.useRef<HTMLDivElement>(null)
  const { messages, sendMessage, regenerate, status, stop } = useChat({
    id,
    messages: initial,
    throttle: 50,
    transport: new DefaultChatTransport({
      api: "/api/coach",
      // The newest user message (after an edit or regenerate useChat has already cut what follows), and what to do with
      // it: the server replays its own saved history (src/app/api/coach/route.ts).
      prepareSendMessagesRequest: ({ messages, id, trigger, messageId }) => ({ body: { id, message: messages.at(-1), trigger, messageId } }),
    }),
    onError: (e) => setError(ERRORS[/\b(limit|key|provider)\b/.exec(e.message)?.[1] ?? ""] ?? "Couldn’t get an answer. Try again."),
    onFinish: ({ message }) => {
      // Read the finished answer once, as plain words (no ** marks); never re-read a saved chat on load.
      setAnnounce(plain(message))
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
  // The morning-brief notification opens /coach?brief=1: its tap is the user's go-ahead, so the brief is asked once.
  const asked = React.useRef(false)
  React.useEffect(() => {
    if (!auto || asked.current) return
    asked.current = true
    send(prefill)
  })
  const edit = (messageId: string, text: string) => {
    if (busy) return
    setError(null)
    void sendMessage({ text, messageId })
  }
  /** A new answer to the newest question: the last answer (Regenerate), or the one that failed (Retry). */
  const again = (messageId?: string) => {
    if (busy) return
    setError(null)
    void regenerate(messageId ? { messageId } : undefined)
  }
  const lastAnswer = messages.at(-1)?.role === "assistant" ? messages.at(-1)!.id : null

  const listOpen = usePanelOpen()
  const keyboard = useKeyboardInset()
  const PANEL_BTN = "rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
  // Provider, key, chats and turning the coach off live in Settings › Coach.
  const settingsLink = (className: string, size: "icon-lg" | "icon-touch") => (
    <Button asChild variant="ghost" size={size} aria-label="Coach settings" className={className}>
      <Link href="/settings#coach">
        <Settings2 aria-hidden strokeWidth={1.6} className={size === "icon-lg" ? "size-[18px]" : undefined} />
      </Link>
    </Button>
  )
  return (
    // Cancels AppShell's bottom padding (room for the phone tab bar, which this screen hides), so the composer rests
    // on the screen's bottom edge, above the safe area, with no gap under it.
    // `data-chats` lets the page frame (page.tsx) make room for the fixed chats panel on laptop.
    <div data-chats={listOpen ? "open" : "closed"} className="-mb-[calc(62px+max(env(safe-area-inset-bottom)-6px,12px)+24px)] md:-mb-10">
      {/* Laptop: the chats beside the app's compact nav rail, in the same glass, radius and inset. Expanded, the list;
          collapsed, a rail of its own (expand, New chat, settings). Remembered per device. */}
      {listOpen ? (
        <aside aria-label="Chats panel" className={cn(GLASS, "fixed inset-y-3 left-[112px] z-30 hidden w-[272px] flex-col rounded-[28px] p-3 xl:flex")}>
          <div className="flex h-14 shrink-0 items-center justify-between gap-1 pl-3">
            <h2 className="text-[15px] leading-5 font-semibold">Chats</h2>
            <span className="flex items-center">
              {settingsLink(PANEL_BTN, "icon-lg")}
              <Button variant="ghost" size="icon-lg" aria-label="Collapse chats" aria-expanded onClick={() => setPanelOpen(false)} className={PANEL_BTN}>
                <PanelLeftClose aria-hidden strokeWidth={1.6} className="size-[18px]" />
              </Button>
            </span>
          </div>
          <NewChatButton label />
          <div aria-hidden className="mx-3 my-2 h-px shrink-0 bg-foreground/8" />
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-none px-1 pb-1">
            <ChatList groups={groups} next={next} current={initial.length ? id : null} showNew={false} />
          </div>
        </aside>
      ) : (
        <aside aria-label="Chats panel" className={cn(GLASS, "fixed inset-y-3 left-[112px] z-30 hidden w-16 flex-col items-center gap-1 rounded-[28px] py-3 xl:flex")}>
          <Button variant="ghost" size="icon-touch" aria-label="Expand chats" aria-expanded={false} onClick={() => setPanelOpen(true)} className={PANEL_BTN}>
            <PanelLeftOpen aria-hidden strokeWidth={1.6} />
          </Button>
          <NewChatButton className={PANEL_BTN} />
          <div aria-hidden className="my-1 h-px w-8 bg-foreground/8" />
          {settingsLink(PANEL_BTN, "icon-touch")}
        </aside>
      )}

      {/* Fills exactly the viewport under the header (its height, the notch and the shell's top padding: 76/84/92 px),
          so a short chat never scrolls by a few pixels. */}
      <div className="mx-auto flex min-h-[calc(100svh-76px-env(safe-area-inset-top))] md:min-h-[calc(100svh-84px-env(safe-area-inset-top))] xl:min-h-[calc(100svh-92px)] w-full max-w-[760px] flex-col pb-[max(env(safe-area-inset-bottom),12px)] md:pb-6">
        {messages.length === 0 ? (
          <div className="my-auto flex flex-col items-center py-8 text-center">
            <span aria-hidden className="grid size-12 place-items-center rounded-full bg-linear-to-br from-insight-from to-insight-to p-px">
              <span className="grid size-full place-items-center rounded-full bg-background">
                <Mark className="size-5" />
              </span>
            </span>
            <h2 className="mt-5 text-[22px] leading-7 font-bold tracking-[-0.01em] text-balance md:text-[26px] md:leading-8">What would you like to know?</h2>
            <p className="mt-2 max-w-[44ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
              The coach looks up your own Pulse numbers before it answers, using {providerLabel}. It’s not medical advice.
            </p>
            <ul className="mt-8 grid w-full max-w-[600px] gap-2 sm:grid-cols-2">
              {suggestions.map(({ text, key }) => {
                const Icon = SUGGESTION_ICONS[key]
                return (
                <li key={text} className="min-w-0">
                  <button type="button" onClick={() => send(text)} className={SUGGESTION}>
                    <Icon aria-hidden className="size-5 shrink-0 text-coach" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 text-pretty">{text}</span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[translate] duration-150 ease-standard group-hover/suggestion:translate-x-0.5" strokeWidth={1.75} />
                  </button>
                </li>
              )})}
            </ul>
            <SheetTrigger
              sheet="checkin"
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-foreground-secondary outline-none transition-[background-color,color,scale] duration-150 ease-standard hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
            >
              <NotebookPen aria-hidden className="size-4" strokeWidth={1.75} />
              Check in for today
            </SheetTrigger>
          </div>
        ) : (
          <div role="log" aria-label="Chat with Pulse’s coach" className="mt-2 space-y-7">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserMessage key={m.id} m={m} busy={busy} onEdit={(text) => edit(m.id, text)} />
              ) : (
                <AssistantMessage key={m.id} m={m} done={!busy || i < messages.length - 1} onRegenerate={!busy && m.id === lastAnswer ? () => again(m.id) : undefined} />
              ),
            )}
            {status === "submitted" && <Caption live>Thinking…</Caption>}
          </div>
        )}

        {/* The finished answer, once, for screen readers (not every token). */}
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>

        {error && (
          <div role="alert" className="mt-6 flex items-center gap-3 rounded-xl bg-recovery-red/12 py-2 pr-2 pl-4 ring-1 ring-recovery-red/25">
            <p className="min-w-0 flex-1 py-1 text-[14px] leading-5 text-pretty text-foreground">{error}</p>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => again()} className="h-9 shrink-0 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold hover:bg-foreground/8 pointer-coarse:h-10">
              <RotateCcw aria-hidden strokeWidth={1.75} className="size-4" />
              Retry
            </Button>
          </div>
        )}

        <div ref={end} className="h-6 scroll-mb-28" />

        {/* Pinned to the bottom of the chat column (not the window), so it lines up with the messages at every width,
            and lifted over the on-screen keyboard (--kb) on phones. Messages scrolling under it fade into the ground
            (the page ground ends in --background), down to the screen's edge. */}
        <div
          style={{ "--kb": `${keyboard}px` } as React.CSSProperties}
          className="sticky bottom-[calc(max(env(safe-area-inset-bottom),12px)+var(--kb))] z-20 mt-auto before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:-bottom-[max(env(safe-area-inset-bottom),12px)] before:-z-10 before:bg-linear-to-b before:from-transparent before:to-background before:to-45% md:bottom-[calc(1.5rem+var(--kb))] md:before:-bottom-6"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className={cn(
              GLASS,
              "flex items-end gap-1.5 rounded-[28px] p-1.5 transition-[box-shadow] duration-150 ease-standard has-[textarea:focus-visible]:ring-foreground/25",
            )}
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
              enterKeyHint="send"
              placeholder="Message Coach"
              className="field-sizing-content max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 pl-3.5 text-[16px] leading-6 text-foreground caret-coach outline-none placeholder:text-muted-foreground"
            />
            {busy ? (
              <Button type="button" size="icon-touch" variant="secondary" onClick={() => stop()} aria-label="Stop">
                <Square aria-hidden className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-touch" disabled={!input.trim()} aria-label="Send">
                <ArrowUp aria-hidden strokeWidth={2.25} />
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
