"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CalendarHeart, Droplet, FlaskConical, Scale, Smile, Thermometer, Trash2, Utensils, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  CYCLE_SYMPTOMS,
  FLOWS,
  KIND_LABEL,
  MEALS,
  MOODS,
  OVULATION_RESULTS,
  RECONNECT,
  SYMPTOMS,
  VALENCES,
  WATER_STEPS,
  type LogKind,
  type LogType,
} from "@/lib/log"
import { deleteLogEntry, logEntry, type LogInput } from "@/server/actions/log"
import type { LogVM } from "@/server/queries/log"
import { CAPTION } from "@/components/metrics/primitives"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { closeSheet, openSheet } from "@/components/shells/SheetTrigger"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CARD_MATERIAL, Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const ICON: Record<LogKind, LucideIcon> = {
  water: Droplet,
  food: Utensils,
  weight: Scale,
  mood: Smile,
  symptoms: Thermometer,
  period: CalendarHeart,
  ovulation: FlaskConical,
}
const TYPE_ICON: Record<LogType, LucideIcon> = {
  "hydration-log": Droplet,
  "nutrition-log": Utensils,
  weight: Scale,
  "body-fat": Scale,
  moods: Smile,
  symptoms: Thermometer,
  "menstrual-period": CalendarHeart,
  "ovulation-test": FlaskConical,
}

/** A selectable chip, as the check-in's Yes/No toggles: white when on. */
const CHIP =
  "h-11 rounded-full border-border px-4 text-[15px] font-medium transition-[background-color,color,border-color] duration-150 ease-standard data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
const FIELD = "h-11 text-base tabular-nums"
const NUM = /^\d+([.,]\d+)?$/

/** The wall clock now in the server's zone, as `YYYY-MM-DDTHH:mm` (what a datetime-local input holds). */
const wallNow = (timeZone: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
const num = (s: string) => (s.trim() === "" ? null : NUM.test(s.trim()) ? Number(s.trim().replace(",", ".")) : NaN)

const when = (ts: number, today: string, timeZone: string) => {
  const d = new Date(ts * 1000)
  const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d)
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d)
  if (day === today) return `Today, ${time}`
  return `${new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(d)}, ${time}`
}

type Form = Record<string, string | string[]>
const EMPTY: Record<LogKind, Form> = {
  water: { ml: "" },
  food: { name: "", meal: "", kcal: "", protein: "", carbs: "", fat: "" },
  weight: { kg: "", fat: "" },
  mood: { valence: "", moods: [] },
  symptoms: { symptoms: [] },
  period: { start: "", end: "", flow: "" },
  ovulation: { result: "" },
}

/** The form's values as the action's input, or the first problem to show. */
function toInput(kind: LogKind, f: Form, at: string): LogInput | string {
  const s = (k: string) => f[k] as string
  const a = (k: string) => f[k] as string[]
  switch (kind) {
    case "water": {
      const ml = num(s("ml"))
      return ml && Number.isInteger(ml) ? { kind, ml, at } : "Enter the amount in millilitres."
    }
    case "food": {
      const [kcal, protein, carbs, fat] = ["kcal", "protein", "carbs", "fat"].map((k) => num(s(k)))
      if (!s("meal")) return "Choose a meal."
      if (kcal == null || Number.isNaN(kcal) || !Number.isInteger(kcal)) return "Enter calories as a whole number."
      if ([protein, carbs, fat].some((g) => Number.isNaN(g))) return "Macros are grams, as numbers."
      return { kind, name: s("name"), meal: s("meal") as never, kcal, protein, carbs, fat, at }
    }
    case "weight": {
      const kg = num(s("kg"))
      const fatPct = num(s("fat"))
      if (kg == null || Number.isNaN(kg)) return "Enter your weight in kilograms."
      if (Number.isNaN(fatPct)) return "Body fat is a percentage, as a number."
      return { kind, kg, fatPct, at }
    }
    case "mood":
      return a("moods").length ? { kind, moods: a("moods") as never, valence: (s("valence") || null) as never, at } : "Choose how you feel."
    case "symptoms":
      return a("symptoms").length ? { kind, symptoms: a("symptoms") as never, at } : "Choose a symptom."
    case "period":
      if (!s("start") || !s("end")) return "Choose the first and last day."
      return { kind, start: s("start"), end: s("end"), flow: (s("flow") || null) as never }
    case "ovulation":
      return s("result") ? { kind, result: s("result") as never, at } : "Choose the result."
  }
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly (readonly [string, string, ...unknown[]])[]
  value: string | string[]
  onChange: (v: string | string[]) => void
}) {
  const items = options.map(([v, l]) => (
    <ToggleGroupItem key={v} value={v} variant="outline" className={CHIP}>
      {l}
    </ToggleGroupItem>
  ))
  return Array.isArray(value) ? (
    <ToggleGroup type="multiple" aria-label={label} spacing={2} value={value} onValueChange={onChange} className="w-full flex-wrap">
      {items}
    </ToggleGroup>
  ) : (
    <ToggleGroup type="single" aria-label={label} spacing={2} value={value} onValueChange={onChange} className="w-full flex-wrap">
      {items}
    </ToggleGroup>
  )
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id} className="text-[15px] leading-[22px] font-medium">
        {label}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </Label>
      {children}
    </div>
  )
}

/** A caps section heading inside a sheet, with the reference app's hairline. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-6 flex flex-col gap-3 first:mt-2">
    <h3 className={SHEET_SECTION}>{title}</h3>
    {children}
  </section>
)

export type LogProps = { vm: LogVM }

/** Journal's Log (spec §11 LG1): one tile per thing to log, each opening its sheet, and what was logged lately. */
export function Log({ vm }: LogProps) {
  const { demo } = vm
  const router = useRouter()
  const params = useSearchParams()
  const [kind, setKind] = React.useState<LogKind | null>(null)
  const [shown, setShown] = React.useState<LogKind>("water")
  const [form, setForm] = React.useState<Form>(EMPTY.water)
  const [at, setAt] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [reconnect, setReconnect] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [remove, setRemove] = React.useState<LogVM["recent"][number] | null>(null)
  const [removing, setRemoving] = React.useState(false)
  const [all, setAll] = React.useState(false)

  const open = (k: LogKind) => {
    setShown(k)
    setForm(EMPTY[k])
    setAt(wallNow(vm.timeZone))
    setError(null)
    setReconnect(vm.access[k] === "reconnect")
    setKind(k)
  }

  // The sheet follows `?log=water`: a tile pushes it, a bookmark arrives with it, and Back closes the sheet without
  // leaving Journal (spec §11 UX2).
  const wanted = params.get("log") as LogKind | null
  const [handled, setHandled] = React.useState<string | null>(null)
  if (wanted !== handled) {
    setHandled(wanted)
    if (wanted && vm.kinds.includes(wanted)) open(wanted)
    else if (!wanted) setKind(null)
  }
  const shut = () => {
    setKind(null)
    closeSheet("log")
  }

  const set = (k: string) => (v: string | string[]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setError(null)
  }

  const send = async (input: LogInput, close = true) => {
    setSaving(true)
    setError(null)
    const r = await logEntry(input).catch(() => ({ ok: false as const, error: "Couldn’t save. Check your connection and try again." }))
    setSaving(false)
    if (!r.ok) {
      if (r.error === RECONNECT) setReconnect(true)
      else setError(r.error)
      return
    }
    if (close) shut()
    toast.success(r.data.demo ? `${KIND_LABEL[input.kind]} saved in Pulse (demo)` : `${KIND_LABEL[input.kind]} saved to Google Health`)
    router.refresh()
  }

  const save = () => {
    const input = toInput(shown, form, at)
    if (typeof input === "string") return setError(input)
    void send(input)
  }

  const confirmRemove = async () => {
    if (!remove) return
    setRemoving(true)
    const r = await deleteLogEntry({ id: remove.id }).catch(() => ({ ok: false as const, error: "network" }))
    setRemoving(false)
    setRemove(null)
    if (!r.ok) return toast.error(r.error === RECONNECT ? "Reconnect Google in Settings to delete it there." : "Couldn’t delete. Try again.")
    toast.success("Deleted")
    router.refresh()
  }

  const access = vm.access[shown]
  const blocked = reconnect || access === "not_connected"
  const recent = all ? vm.recent : vm.recent.slice(0, 6)
  const timeField = shown !== "period" && (
    <Field id="log-at" label="Time">
      <Input id="log-at" type="datetime-local" value={at} max={wallNow(vm.timeZone)} onChange={(e) => setAt(e.target.value)} className={FIELD} />
    </Field>
  )

  return (
    <>
      {/* Phone: one row that scrolls edge to edge, as the day strip above it; from 768 px every tile fits in one row. */}
      <ul aria-label="Log" className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-flow-col md:auto-cols-fr md:overflow-visible md:px-0">
        {vm.kinds.map((k) => {
          const Icon = ICON[k]
          return (
            <li key={k} className="shrink-0 snap-start">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => openSheet("log", k)}
                aria-label={k === "water" ? `Water, ${vm.waterToday ? `${vm.waterToday.toLocaleString("en-US")} ml` : "none"} today` : undefined}
                className={cn(
                  CARD_MATERIAL,
                  "flex h-23 w-[84px] flex-col items-start justify-between p-3 text-left md:px-2.5 transition-[scale,--tw-gradient-from] duration-150 ease-standard outline-none hover:from-card-hover focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] md:w-full"
                )}
              >
                <Icon aria-hidden className="size-5 text-foreground-secondary" strokeWidth={1.75} />
                {/* Every label on one baseline; water's running total sits above its label. */}
                <span className="flex flex-col">
                  {k === "water" && (
                    <span className="font-numeric text-xs leading-4 font-medium text-muted-foreground tabular-nums">
                      {vm.waterToday ? `${vm.waterToday.toLocaleString("en-US")} ml` : "None today"}
                    </span>
                  )}
                  <span className="text-[13px] leading-[18px] font-semibold">{KIND_LABEL[k] === "Ovulation test" ? "Ovulation" : KIND_LABEL[k]}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {demo && <p className={cn(CAPTION, "mt-3")}>Demo: what you log stays in Pulse and never reaches Google.</p>}

      {vm.recent.length > 0 && (
        <Card className="mt-4 gap-0 px-4 py-1 xl:px-5">
          <ul aria-label="Logged in the last 14 days">
            {recent.map((e, i) => {
              const Icon = TYPE_ICON[e.type]
              return (
                <li key={e.id} className={cn("flex min-h-14 items-center gap-3 py-2", i > 0 && "border-t border-border")}>
                  <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] leading-[22px]">
                      {e.title} <span className="text-foreground-secondary">{e.detail}</span>
                    </span>
                    <span className={cn(CAPTION, "tabular-nums")}>
                      {e.type === "menstrual-period" ? e.day : when(e.ts, vm.today, vm.timeZone)}
                      {!e.atGoogle && !demo && ", in Pulse only"}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon-touch" aria-label={`Delete ${e.title.toLowerCase()}, ${e.detail}`} onClick={() => setRemove(e)} className="-mr-2 text-muted-foreground hover:text-foreground">
                    <Trash2 aria-hidden strokeWidth={1.75} />
                  </Button>
                </li>
              )
            })}
          </ul>
          {vm.recent.length > 6 && (
            <Button variant="ghost" size="touch" className="-mx-2 mb-1 self-start text-foreground-secondary" onClick={() => setAll((x) => !x)}>
              {all ? "Show less" : `Show all ${vm.recent.length}`}
            </Button>
          )}
        </Card>
      )}

      <ResponsiveSheet
        open={kind !== null}
        onOpenChange={(o) => !o && !saving && shut()}
        title={`Log ${KIND_LABEL[shown].toLowerCase()}`}
        description={blocked ? undefined : demo ? "Demo: saved in Pulse only" : "Saved to Google Health"}
        footer={
          blocked ? null : (
            <>
              {error && (
                <Alert role="alert" className="border-0 bg-recovery-red/15 px-3 py-2">
                  <AlertDescription className="text-recovery-red-text">{error}</AlertDescription>
                </Alert>
              )}
              <Button size="sheet" onClick={save} disabled={saving} aria-live="polite">
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )
        }
      >
        {blocked ? (
          <div className="flex flex-col gap-4 pt-2">
            <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
              {access === "not_connected"
                ? "Connect Google to log to Google Health."
                : `Pulse needs new permissions to save ${KIND_LABEL[shown].toLowerCase()} to Google Health. Reconnect Google and allow them; nothing you have synced is lost.`}
            </p>
            <Button asChild size="sheet">
              <a href="/oauth/start">
                {access === "not_connected" ? "Connect Google" : "Reconnect Google"}
              </a>
            </Button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            {shown === "water" && (
              <>
                <Section title="Add">
                  <div className="grid grid-cols-2 gap-2">
                    {WATER_STEPS.map((ml) => (
                      <Button key={ml} type="button" variant="secondary" size="touch" disabled={saving} className="h-14 text-[15px]" onClick={() => void send({ kind: "water", ml, at }, false)}>
                        <Droplet aria-hidden strokeWidth={1.75} />+{ml} ml
                      </Button>
                    ))}
                  </div>
                  <p className={cn(CAPTION, "tabular-nums")} aria-live="polite">
                    Today: {vm.waterToday.toLocaleString("en-US")} ml
                  </p>
                </Section>
                <Section title="Other amount">
                  <Field id="log-ml" label="Amount" hint="(ml)">
                    <Input id="log-ml" inputMode="numeric" autoComplete="off" placeholder="e.g. 330" value={form.ml as string} onChange={(e) => set("ml")(e.target.value)} className={FIELD} />
                  </Field>
                  {timeField}
                </Section>
              </>
            )}

            {shown === "food" && (
              <>
                <Section title="Meal">
                  <Chips label="Meal" options={MEALS} value={form.meal as string} onChange={set("meal")} />
                </Section>
                <Section title="What you ate">
                  <Field id="log-name" label="Name" hint="(optional)">
                    <Input id="log-name" autoComplete="off" maxLength={80} placeholder="e.g. Dal and rice" value={form.name as string} onChange={(e) => set("name")(e.target.value)} className="h-11 text-base" />
                  </Field>
                  <Field id="log-kcal" label="Calories" hint="(kcal)">
                    <Input id="log-kcal" inputMode="numeric" autoComplete="off" value={form.kcal as string} onChange={(e) => set("kcal")(e.target.value)} className={FIELD} />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    {(["protein", "carbs", "fat"] as const).map((m) => (
                      <Field key={m} id={`log-${m}`} label={m[0].toUpperCase() + m.slice(1)} hint="(g)">
                        <Input id={`log-${m}`} inputMode="decimal" autoComplete="off" value={form[m] as string} onChange={(e) => set(m)(e.target.value)} className={FIELD} />
                      </Field>
                    ))}
                  </div>
                  {timeField}
                </Section>
              </>
            )}

            {shown === "weight" && (
              <Section title="Measurement">
                <div className="grid grid-cols-2 gap-2">
                  <Field id="log-kg" label="Weight" hint="(kg)">
                    <Input id="log-kg" inputMode="decimal" autoComplete="off" value={form.kg as string} onChange={(e) => set("kg")(e.target.value)} className={FIELD} />
                  </Field>
                  <Field id="log-fat" label="Body fat" hint="(%)">
                    <Input id="log-fat" inputMode="decimal" autoComplete="off" placeholder="Optional" value={form.fat as string} onChange={(e) => set("fat")(e.target.value)} className={FIELD} />
                  </Field>
                </div>
                {timeField}
              </Section>
            )}

            {shown === "mood" && (
              <>
                <Section title="Overall">
                  <Chips label="Overall" options={VALENCES} value={form.valence as string} onChange={set("valence")} />
                </Section>
                <Section title="Feelings">
                  <Chips label="Feelings" options={MOODS} value={form.moods as string[]} onChange={set("moods")} />
                </Section>
                <Section title="When">{timeField}</Section>
              </>
            )}

            {shown === "symptoms" && (
              <>
                <Section title="Symptoms">
                  <Chips
                    label="Symptoms"
                    options={SYMPTOMS.filter((s) => vm.kinds.includes("period") || !CYCLE_SYMPTOMS.has(s[0]))}
                    value={form.symptoms as string[]}
                    onChange={set("symptoms")}
                  />
                </Section>
                <Section title="When">{timeField}</Section>
              </>
            )}

            {shown === "period" && (
              <>
                <Section title="Days">
                  <div className="grid grid-cols-2 gap-2">
                    <Field id="log-start" label="First day">
                      <Input id="log-start" type="date" max={vm.today} value={form.start as string} onChange={(e) => set("start")(e.target.value)} className={FIELD} />
                    </Field>
                    <Field id="log-end" label="Last day">
                      <Input id="log-end" type="date" max={vm.today} min={(form.start as string) || undefined} value={form.end as string} onChange={(e) => set("end")(e.target.value)} className={FIELD} />
                    </Field>
                  </div>
                  <p className={CAPTION}>Still going? Use today as the last day, and log it again once it ends.</p>
                </Section>
                <Section title="Flow">
                  <Chips label="Flow" options={FLOWS} value={form.flow as string} onChange={set("flow")} />
                </Section>
              </>
            )}

            {shown === "ovulation" && (
              <>
                <Section title="Result">
                  <Chips label="Result" options={OVULATION_RESULTS} value={form.result as string} onChange={set("result")} />
                </Section>
                <Section title="When">{timeField}</Section>
              </>
            )}
            {/* Enter in a field submits; the visible Save lives in the sheet footer. */}
            <button type="submit" hidden />
          </form>
        )}
      </ResponsiveSheet>

      <Dialog open={remove !== null} onOpenChange={(o) => !o && !removing && setRemove(null)}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {remove && `${remove.title}, ${remove.detail}. `}
              {remove?.atGoogle ? "It is deleted from Google Health too." : "It is deleted from Pulse."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="touch" onClick={() => setRemove(null)} disabled={removing}>
              Keep
            </Button>
            <Button variant="outline" size="touch" className="text-recovery-red-text" onClick={confirmRemove} disabled={removing}>
              {removing ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
