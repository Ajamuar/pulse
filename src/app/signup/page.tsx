import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { currentUser } from "@/server/auth"
import { getConfig } from "@/server/config"
import { SignupForm } from "@/components/auth/AuthForm"
import { AUTH_FOOTNOTE, AUTH_LINK } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Create account" }

/** Create an account `/signup`. Closed on a demo instance and with DISABLE_SIGNUP=true: back to sign-in. */
export default async function SignupPage() {
  await connection()
  if (await currentUser()) redirect("/")
  const { dataSource, disableSignup } = getConfig()
  if (dataSource !== "google" || disableSignup) redirect("/login")
  return (
    <AuthShell align="top">
      {/* No hero: on a phone the four fields and the button fit above the keyboard's fold. */}
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-balance">Create your account</h1>
      <p className="mt-2 text-[16px] leading-6 text-pretty text-foreground-secondary">Your data stays on this server, visible only to you.</p>
      <div className="mt-7 space-y-5 pb-[max(env(safe-area-inset-bottom),24px)]">
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
