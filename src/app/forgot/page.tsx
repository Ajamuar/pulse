import type { Metadata } from "next"
import Link from "next/link"
import { AUTH_FOOTNOTE, AUTH_LINK, AuthHero } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"

export const metadata: Metadata = { title: "Forgot password" }

/** Forgot password `/forgot`. Pulse sends no email: whoever runs the server sets a temporary password. */
export default function ForgotPage() {
  return (
    <AuthShell>
      <AuthHero compact title="Forgot your password?" body="This Pulse server doesn’t send email, so the person who runs it resets passwords." />
      <div className="mt-8 space-y-5">
        <div className="space-y-3 rounded-2xl bg-secondary p-4">
          <p className="text-[15px] leading-[22px] text-pretty text-foreground-secondary">Ask them to run this on the server, with your email or username:</p>
          <code translate="no" className="block overflow-x-auto rounded-lg bg-background/60 px-3 py-2.5 font-mono text-[13px] leading-5 whitespace-pre-wrap break-all text-foreground select-all">
            docker exec pulse node scripts/reset-password.mjs &lt;your email or username&gt;
          </code>
          <p className="text-[13px] leading-[18px] text-pretty text-muted-foreground">
            It prints a temporary password and signs you out everywhere. Sign in with it, then change it in Settings › Account.
          </p>
        </div>
        <p className={AUTH_FOOTNOTE}>
          <Link href="/login" className={AUTH_LINK}>
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
