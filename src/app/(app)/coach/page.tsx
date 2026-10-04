import { randomUUID } from "node:crypto"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { providerLabel, providerOptions } from "@/server/coach/options"
import { coachAccess, coachSetup, groupChats, listChats, loadChat } from "@/server/coach/store"
import { userCtx } from "@/server/queries/common"
import { DetailShell } from "@/components/shells/DetailShell"
import { Coach } from "./Coach"
import { Consent, ProviderForm } from "./CoachSetup"

export const metadata = { title: "Coach" }

/**
 * Coach `/coach` (spec §7.21): consent, then a provider and key (BYOK), then the chat. `?c=` opens a past chat,
 * `?q=` fills the composer without sending. Only for users an admin gave coach access; anyone else gets a 404.
 */
export default async function CoachPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  await connection()
  const { db, userId, now, timeZone } = await userCtx()
  if (!(await coachAccess(db, userId))) notFound()
  const [setup, chats, { c, q }] = await Promise.all([coachSetup(db, userId), listChats(db, userId), searchParams])

  if (!setup.consent || !setup.provider)
    return (
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
    )

  const saved = c && /^[\w-]{8,64}$/.test(c) ? await loadChat(db, userId, c) : null
  const id = saved ? c! : randomUUID()
  return (
    <DetailShell
      title="Coach"
      primary={<Coach key={id} id={id} initial={saved ?? []} groups={groupChats(chats, now, timeZone)} prefill={(q ?? "").slice(0, 500)} providerLabel={providerLabel(setup.provider)} />}
    />
  )
}
