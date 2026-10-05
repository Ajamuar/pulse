import { connection } from "next/server"
import { isAdmin } from "@/server/admin"
import { getConfig } from "@/server/config"
import { currentUser, DEMO_EMAIL } from "@/server/auth"
import { avatarSrc, connectedGoogleEmail } from "@/server/avatar"
import { providerLabel, providerOptions } from "@/server/coach/options"
import { coachAccess, coachSetup } from "@/server/coach/store"
import { pushPublicKey } from "@/server/push"
import { userCtx } from "@/server/queries/common"
import { CoachSettings } from "../coach/CoachSettings"
import { getSettings } from "@/server/queries/settings"
import { DetailShell } from "@/components/shells/DetailShell"
import { OAuthToast } from "./SettingsClient"
import { SettingsView } from "./SettingsView"

/** The request time; relative sync ages are computed against it on the server. */
const requestTime = () => Date.now()

export const metadata = { title: "Settings" }

/** Settings `/settings` (spec §7.14, journeys 9 and 10). Google's callback lands here with `?oauth=`. */
export default async function SettingsPage() {
  await connection()
  const ctx = await userCtx()
  const [vm, user, avatar, googleEmail, coach, coachState] = await Promise.all([
    getSettings(ctx),
    currentUser(),
    avatarSrc(ctx.db, ctx.userId),
    connectedGoogleEmail(ctx.db, ctx.userId),
    coachAccess(ctx.db, ctx.userId),
    coachSetup(ctx.db, ctx.userId),
  ])
  // Same rule as the admin gate: only a Google instance has an admin panel.
  const admin = getConfig().dataSource === "google" && (await isAdmin(ctx.db, ctx.userId))
  return (
    <DetailShell
      title="Settings"
      dismiss="close"
      primary={
        <>
          <OAuthToast />
          <SettingsView
            vm={vm}
            now={requestTime()}
            pushKey={pushPublicKey()}
            coach={coach && <CoachSettings setup={coachState} providers={providerOptions()} providerLabel={providerLabel(coachState.provider)} />}
            account={{
              email: user?.email ?? null,
              name: user?.name ?? null,
              username: user?.username ?? null,
              demo: user?.email === DEMO_EMAIL,
              avatar,
              customPhoto: avatar?.startsWith("/avatar?") ?? false,
              googleEmail,
              admin,
            }}
          />
        </>
      }
    />
  )
}
