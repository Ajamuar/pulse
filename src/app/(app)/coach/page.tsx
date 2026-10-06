import { randomUUID } from "node:crypto"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { providerLabel, providerOptions } from "@/server/coach/options"
import { coachAccess, coachSetup, groupChats, listChats, loadChat } from "@/server/coach/store"
import { userCtx } from "@/server/queries/common"
import { DetailShell } from "@/components/shells/DetailShell"
import { coachSuggestions } from "@/server/coach/suggestions"
import { Coach, CoachBarActions } from "./Coach"
import { Consent, ProviderForm } from "./CoachSetup"

export const metadata = { title: "Coach" }

/**
 * From 1280 px the app nav stays the 88 px rail here (AppNav), so the frame gives back the sidebar's extra width
 * (256 − 112 px); the chats panel (Coach.tsx, fixed beside the rail) then takes 272 px expanded or 64 px collapsed,
 * plus a 12 px gap, and the header and conversation centre in what is left.
 */
const FRAME = "xl:-ml-[144px] xl:has-data-[chats=closed]:pl-[76px] xl:has-data-[chats=open]:pl-[284px]"

/**
 * Coach `/coach` (spec §7.21): consent, then a provider and key (BYOK), then the chat. `?c=` opens a past chat,
 * `?q=` fills the composer without sending, `?brief=1` (the morning notification) asks for today's brief at once. Only for users an admin gave coach access; anyone else gets a 404.
 */
export default async function CoachPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; brief?: string }> }) {
  await connection()
  const ctx = await userCtx()
  const { db, userId, now, timeZone } = ctx
  if (!(await coachAccess(db, userId))) notFound()
  const [setup, { chats, next }, { c, q, brief }] = await Promise.all([coachSetup(db, userId), listChats(db, userId), searchParams])

  if (!setup.consent || !setup.provider)
    return (
      <div className={FRAME}>
        <DetailShell
          title="Coach"
          primary={
            <div className="mx-auto w-full max-w-[560px] pb-10">
              {!setup.consent ? (
                <Consent />
              ) : (
                <div className="space-y-4">
                  <h2 className="text-[22px] leading-7 font-bold text-balance">Connect your AI provider</h2>
                  <p className="text-[15px] leading-[22px] text-pretty text-foreground-secondary">The coach runs on your own account with a provider, so you pay them directly for what you use.</p>
                  <ProviderForm providers={providerOptions()} current={setup} />
                </div>
              )}
            </div>
          }
        />
      </div>
    )

  const saved = c && /^[\w-]{8,64}$/.test(c) ? await loadChat(db, userId, c) : null
  const id = saved ? c! : randomUUID()
  const suggestions = await coachSuggestions(ctx)
  const groups = groupChats(chats, now, timeZone)
  const chatCount = groups.reduce((n, g) => n + g.chats.length, 0)
  return (
    <div className={FRAME}>
      <DetailShell
        title="Coach"
        action={<CoachBarActions chatCount={chatCount} chatOpen={(saved?.length ?? 0) > 0} />}
        primary={<Coach key={id} id={id} initial={saved ?? []} groups={groups} next={next} prefill={brief === "1" && !saved ? "Today's brief" : (q ?? "").slice(0, 500)} auto={brief === "1" && !saved} providerLabel={providerLabel(setup.provider)} suggestions={suggestions} />}
      />
    </div>
  )
}
