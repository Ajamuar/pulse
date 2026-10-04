"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Ellipsis, MessageSquarePlus } from "lucide-react"
import { toast } from "sonner"
import { deleteChatAction } from "@/server/actions/coach"
import type { ChatGroup, ChatRow } from "@/server/coach/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** One chat: the link fills the row; its menu (Delete) shows on hover or focus, and always on touch screens. */
function ChatItem({ chat, current }: { chat: ChatRow; current: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = React.useState(false)
  const [pending, start] = React.useTransition()
  const remove = () =>
    start(async () => {
      const r = await deleteChatAction(chat.id).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
      setConfirm(false)
      toast.success("Chat deleted.")
      if (current) router.replace("/coach")
      else router.refresh()
    })
  return (
    <li className="group/chat relative">
      <Link
        href={`/coach?c=${chat.id}`}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-10 items-center rounded-lg py-2 pr-11 pl-3 text-[14px] leading-5 outline-none transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50",
          current ? "bg-foreground/[0.06] font-medium text-foreground" : "text-foreground-secondary hover:bg-foreground/[0.04] hover:text-foreground",
        )}
      >
        <span className="line-clamp-2 text-pretty">{chat.title}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for “${chat.title}”`}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground opacity-100 outline-none transition-[opacity,background-color] duration-150 ease-standard hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/chat:opacity-100"
          >
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            Delete chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={(o) => !pending && setConfirm(o)}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Delete this chat?</DialogTitle>
            <DialogDescription>“{chat.title}” and its answers are removed from this server. This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" size="touch" onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="outline" size="touch" className="text-recovery-red-text" onClick={remove} disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Deleting…" : "Delete chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/**
 * The coach's chats (spec §7.21): New chat on top, then the chats grouped by recency. Beside the conversation on
 * laptop, and its own page (/coach/chats) on smaller screens.
 */
export function ChatList({ groups, current, className, showNew = true }: { groups: ChatGroup[]; current: string | null; className?: string; showNew?: boolean }) {
  return (
    <nav aria-label="Chats" className={cn("flex flex-col gap-4", className)}>
      {showNew && (
      <Button asChild variant="ghost" className="h-10 justify-start gap-2.5 rounded-xl px-3 text-[14px] font-semibold ring-1 ring-border hover:bg-foreground/[0.04]">
        <Link href="/coach">
          <MessageSquarePlus aria-hidden className="size-[18px]" strokeWidth={1.75} />
          New chat
        </Link>
      </Button>
      )}
      {groups.length === 0 ? (
        <p className="px-3 text-[14px] leading-5 text-pretty text-muted-foreground">Your chats appear here. They’re saved on this server, visible only to you.</p>
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="px-3 pb-1 text-[13px] leading-[18px] font-medium text-muted-foreground">{g.label}</h2>
            <ul>
              {g.chats.map((c) => (
                <ChatItem key={c.id} chat={c} current={c.id === current} />
              ))}
            </ul>
          </section>
        ))
      )}
    </nav>
  )
}
