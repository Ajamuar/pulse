import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { accountOf, issueSetupCode, MAX_PASSWORD, MIN_PASSWORD } from "@/server/account"
import { getConfig } from "@/server/config"
import { getDb } from "@/server/db"
import { AuthField, AuthForm } from "@/components/auth/AuthForm"
import { AUTH_FOOTNOTE, AUTH_LINK, AuthAlert, AuthHero } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Set up Pulse" }

const ERRORS: Record<string, string> = {
  bad_code: "That code isn’t valid or has expired. Use the latest setup code in the server log.",
  short_password: `Use at least ${MIN_PASSWORD} characters.`,
  long_password: `Use at most ${MAX_PASSWORD} characters.`,
  bad_email: "Enter a valid email address.",
  throttled: "Too many tries. Wait a few minutes, then try again.",
}

const LOG_HINT = (
  <>
    Printed in the server log. Run <code translate="no" className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground-secondary">docker logs pulse</code> and copy the latest code.
  </>
)

/**
 * `/setup`: creates the Pulse account the first time, and resets its password after (the email stays). Either way
 * it needs the one-time code this page logs, so only someone who can read the server's log gets in.
 */
export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  await connection()
  if (!getConfig().google) redirect("/login")
  const reset = accountOf(getDb()) !== null
  issueSetupCode()
  const sp = await searchParams
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? "That didn’t work. Try again.") : null
  const email = typeof sp.email === "string" ? sp.email : ""
  const field = (code: string) => sp.error === code || undefined

  return (
    <AuthShell>
      {reset ? (
        <AuthHero compact title="Reset your password" body="Choose a new password. Every other device is signed out." />
      ) : (
        <AuthHero compact title="Create your account" body="One-time setup for this server. You connect Google next, from inside Pulse." />
      )}
      <div className="mt-8 space-y-5">
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthForm action="/login/setup" submit={reset ? "Reset password" : "Create account"} pendingLabel={reset ? "Resetting…" : "Creating…"}>
          {!reset && <AuthField label="Email" name="email" type="email" autoComplete="username" required defaultValue={email} autoFocus aria-invalid={field("bad_email")} />}
          <AuthField
            label={reset ? "New password" : "Password"}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            maxLength={MAX_PASSWORD}
            autoFocus={reset}
            hint={`At least ${MIN_PASSWORD} characters.`}
            aria-invalid={field("short_password") || field("long_password")}
          />
          <AuthField
            label="Setup code"
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
            placeholder="ABCD-EFGH"
            hint={LOG_HINT}
            aria-invalid={field("bad_code")}
          />
        </AuthForm>
        {reset ? (
          <p className="text-center">
            <Link href="/login" className={AUTH_LINK}>
              Back to sign in
            </Link>
          </p>
        ) : (
          <p className={AUTH_FOOTNOTE}>Pulse has one account per server. Your data stays here.</p>
        )}
      </div>
    </AuthShell>
  )
}
