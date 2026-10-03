import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { currentUser } from "@/server/auth"
import { getConfig } from "@/server/config"
import { SignupForm } from "@/components/auth/AuthForm"
import { AUTH_FOOTNOTE, AUTH_LINK, AuthHero } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Create account" }

/** Create an account `/signup`. Closed on a demo instance and with DISABLE_SIGNUP=true: back to sign-in. */
export default async function SignupPage() {
  await connection()
  if (await currentUser()) redirect("/")
  const { googleOAuthEnabled, disableSignup } = getConfig()
  if (!googleOAuthEnabled || disableSignup) redirect("/login")
  return (
    <AuthShell align="top">
      <AuthHero compact title="Create your account" body="Your data stays on this server, visible only to you." />
      <div className="mt-8 space-y-5 pb-[max(env(safe-area-inset-bottom),24px)]">
        <SignupForm />
        <p className={AUTH_FOOTNOTE}>
          Already have an account?{" "}
          <Link href="/login" className={AUTH_LINK}>
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
