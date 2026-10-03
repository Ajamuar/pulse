import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { currentUser } from "@/server/auth"
import { getConfig } from "@/server/config"
import { DemoSignIn } from "@/components/auth/AuthButtons"
import { LoginForm } from "@/components/auth/AuthForm"
import { AUTH_FOOTNOTE, AUTH_LINK, AuthHero } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Sign in" }

/**
 * Sign in `/login`. A real instance signs in with an email or username and a password (Google only feeds the data,
 * connected from inside), and links to sign-up while it is open. A demo instance offers the demo only.
 */
export default async function LoginPage() {
  await connection()
  if (await currentUser()) redirect("/")
  const { dataSource, disableSignup } = getConfig()

  if (dataSource !== "google") {
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
        <LoginForm />
        <p className={AUTH_FOOTNOTE}>
          {disableSignup ? (
            "Your data stays on this server."
          ) : (
            <>
              New to Pulse?{" "}
              <Link href="/signup" className={AUTH_LINK}>
                Create account
              </Link>
            </>
          )}
        </p>
      </div>
    </AuthShell>
  )
}
