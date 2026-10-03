import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { accountOf } from "@/server/account"
import { getConfig } from "@/server/config"
import { getDb } from "@/server/db"
import { DemoSignIn } from "@/components/auth/AuthButtons"
import { AuthField, AuthForm } from "@/components/auth/AuthForm"
import { AUTH_FOOTNOTE, AUTH_LINK, AuthAlert, AuthHero } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Sign in" }

/** What a failed sign-in says (codes from POST /login/password). Never which of email or password was wrong. */
const ERRORS: Record<string, string> = {
  bad_credentials: "Email or password is incorrect.",
  throttled: "Too many tries. Wait a few minutes, then try again.",
}

/**
 * Sign in `/login`. A real instance signs in with the Pulse account's email and password (Google only feeds the data,
 * connected from inside); before the account exists it sends you to /setup. A demo instance offers the demo only.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection()
  const google = !!getConfig().google
  if (google && !accountOf(getDb())) redirect("/setup")
  const sp = await searchParams
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? "Sign-in didn’t finish. Try again.") : null
  const email = typeof sp.email === "string" ? sp.email : ""

  if (!google) {
    return (
      <AuthShell
        actions={
          <>
            <DemoSignIn />
            <p className={AUTH_FOOTNOTE}>
              This server runs on generated data. To use your own, set up a Google OAuth client (see <span translate="no">docs/setup.md</span>).
            </p>
          </>
        }
      >
        <AuthHero title="Know when to push, and when to rest" body="Recovery, Strain and Sleep from your Fitbit Air, scored on your own server." />
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthHero compact title="Welcome back" body="Sign in to see today’s Recovery, Strain and Sleep." />
      <div className="mt-8 space-y-5">
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthForm action="/login/password" submit="Sign in" pendingLabel="Signing in…">
          <AuthField label="Email" name="email" type="email" autoComplete="username" required defaultValue={email} autoFocus={!email} />
          <AuthField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus={!!email}
            aria-invalid={sp.error === "bad_credentials" || undefined}
            aside={
              <Link href="/setup" className={AUTH_LINK}>
                Forgot password?
              </Link>
            }
          />
        </AuthForm>
        <p className={AUTH_FOOTNOTE}>Your data stays on this server.</p>
      </div>
    </AuthShell>
  )
}
