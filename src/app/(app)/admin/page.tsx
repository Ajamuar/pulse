import { connection } from "next/server"
import { notFound } from "next/navigation"
import { ago } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isAdmin, listAccounts, listInvites, signupMode, type AccountRow, type InviteRow } from "@/server/admin"
import { userCtx } from "@/server/queries/common"
import { CAPTION } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Badge } from "@/components/ui/badge"
import { coachMode, type CoachMode } from "@/server/coach/store"
import { AccountActions, CoachSwitch, ModeToggle, NewInvite, RevokeInvite } from "./AdminClient"

export const metadata = { title: "Admin" }

const BODY = "max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary"
const ROW = "flex min-h-14 items-center gap-3 py-2"
const NAME = "truncate text-[15px] leading-[22px] font-semibold"
const LINE = "truncate text-[13px] leading-[18px] text-muted-foreground"

const MODE_BODY = {
  invite: "People need an invite link from an admin to create an account.",
  open: "Anyone who can reach this server can create an account.",
  closed: "Nobody can create an account. Existing accounts still sign in.",
}

const COACH_BODY: Record<CoachMode, string> = {
  off: "Nobody sees the coach.",
  everyone: "Every account can set up the coach with its own key.",
  chosen: "Only the accounts switched on below, and the owners, can set up the coach.",
}

function InviteItem({ invite, now }: { invite: InviteRow; now: number }) {
  const daysLeft = Math.ceil((invite.expiresAt * 1000 - now) / 86_400_000)
  const expired = invite.usedAt === null && daysLeft <= 0
  const status =
    invite.usedAt !== null
      ? `Used ${ago(invite.usedAt * 1000, now)}${invite.usedBy ? ` by ${invite.usedBy}` : ""}`
      : expired
        ? "Expired"
        : `Expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1">
        <p className={NAME}>{invite.label ?? "Invite"}</p>
        <p className={cn(LINE, expired && "text-warning")}>
          Created {ago(invite.createdAt * 1000, now)} · {status}
        </p>
      </div>
      {invite.usedAt === null && <RevokeInvite id={invite.id} label={invite.label ?? "this invite"} />}
    </li>
  )
}

const ROLE_BADGE: Record<AccountRow["role"], string | null> = { owner: "Owner", admin: "Admin", user: null }

function AccountItem({ account, me, now, chosen }: { account: AccountRow; me: number; now: number; chosen: boolean }) {
  const badge = ROLE_BADGE[account.role]
  const line = [account.username && `@${account.username}`, account.email].filter(Boolean).join(" · ")
  const seen = account.lastSeen ? `Active ${ago(account.lastSeen.getTime(), now)}` : "Signed out"
  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className={NAME}>{account.name}</span>
          {badge && <Badge variant="secondary">{badge}</Badge>}
          {account.id === me && <span className={CAPTION}>You</span>}
        </p>
        <p className={LINE}>{line}</p>
        <p className={LINE}>
          Joined {ago(account.createdAt.getTime(), now)} · {seen} · {account.google ? "Google connected" : "Google not connected"}
        </p>
        {chosen && account.role !== "owner" && (
          <div className="mt-2">
            <CoachSwitch id={account.id} name={account.name} allowed={account.coachAllowed} />
          </div>
        )}
      </div>
      {account.role !== "owner" && account.id !== me && <AccountActions id={account.id} name={account.name} admin={account.role === "admin"} />}
    </li>
  )
}

/**
 * Admin `/admin`: the sign-up mode, invite links and the accounts on this server. Admins only (ADMIN_EMAILS and
 * promoted accounts) on a Google instance; anyone else gets a 404. It shows who has an account, never their data.
 */
export default async function AdminPage() {
  await connection()
  const { db, userId, mode: source, now: nowS } = await userCtx()
  if (source !== "google" || !(await isAdmin(db, userId))) notFound()
  const [mode, coach, invites, accounts] = await Promise.all([signupMode(db), coachMode(db), listInvites(db), listAccounts(db)])
  const now = nowS * 1000

  return (
    <DetailShell
      title="Admin"
      primary={
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
          <SectionShell variant="card" level={2} title="Sign-up">
            <ModeToggle kind="signup" mode={mode} />
            <p className={cn(BODY, "mt-3")}>{MODE_BODY[mode]}</p>
          </SectionShell>

          <SectionShell variant="card" level={2} title="Coach">
            <ModeToggle kind="coach" mode={coach} />
            <p className={cn(BODY, "mt-3")}>{COACH_BODY[coach]}</p>
            <p className={cn(CAPTION, "mt-2")}>Each person brings their own AI provider key, so the coach costs this server nothing. Admins never see anyone’s key or chats.</p>
          </SectionShell>

          <SectionShell variant="card" level={2} title="Invites">
            <p className={BODY}>Each link makes one account and expires after 7 days. The link is shown once.</p>
            <NewInvite />
            {invites.length > 0 && (
              <ul className="mt-4 divide-y divide-border border-t border-border">
                {invites.map((i) => (
                  <InviteItem key={i.id} invite={i} now={now} />
                ))}
              </ul>
            )}
          </SectionShell>

          <SectionShell variant="card" level={2} title="Accounts" aside={<span className={`${CAPTION} tabular-nums`}>{accounts.length}</span>}>
            <ul className="divide-y divide-border">
              {accounts.map((a) => (
                <AccountItem key={a.id} account={a} me={userId} now={now} chosen={coach === "chosen"} />
              ))}
            </ul>
            <p className={cn(CAPTION, "mt-3")}>Owners come from ADMIN_EMAILS and are changed there. Admins see this page; nobody sees another account’s data.</p>
          </SectionShell>
        </div>
      }
    />
  )
}
