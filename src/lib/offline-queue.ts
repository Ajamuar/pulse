import { saveJournalEntry } from "@/server/actions/journal"

// Check-in answers saved while the connection was down. They are plain upserts (day, tag, value), so replaying
// them later is safe; the newest answer for a (day, tag) wins. localStorage is enough: a check-in is a handful of
// small entries, and this is only read back on this device.
const KEY = "pulse:journal-queue"
export type Queued = { day: string; tag: string; value: boolean | null }

const read = (): Queued[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]")
  } catch {
    return []
  }
}
const write = (q: Queued[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    // Storage full or blocked: the entries are lost, same as before the queue existed.
  }
}

export function enqueue(entries: Queued[]) {
  const q = read().filter((o) => !entries.some((e) => e.day === o.day && e.tag === o.tag))
  write([...q, ...entries])
}

export const queued = () => read().length

let flushing = false
/** Sends what is queued; returns how many went through. An entry the server rejects (unknown tag, future day) is dropped; a network failure or a signed-out session keeps the rest for later. */
export async function flushQueue(): Promise<number> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    for (const item of read()) {
      const r = await saveJournalEntry(item).catch(() => null)
      if (!r || (!r.ok && r.error.startsWith("Signed out"))) break
      write(read().filter((o) => !(o.day === item.day && o.tag === item.tag && o.value === item.value)))
      if (r.ok) sent++
    }
  } finally {
    flushing = false
  }
  return sent
}
