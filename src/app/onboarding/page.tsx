import type { Metadata } from "next"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { currentUser } from "@/server/auth"
import { getConfig } from "@/server/config"
import { getDb } from "@/server/db"
import { getProfile } from "@/server/profile"
import { googleAge } from "@/server/sources/google/oauth"
import { Onboarding } from "./Onboarding"

export const metadata: Metadata = { title: "Your profile" }

/** First run `/onboarding` (U19): the (app) layout sends a signed-in user here until they have a profile. */
export default async function OnboardingPage() {
  await connection()
  const user = await currentUser()
  if (!user) redirect("/login")
  const db = getDb()
  if (await getProfile(db, user.userId)) redirect("/")
  const { google } = getConfig()
  return <Onboarding age={google ? await googleAge(db, user.userId, google) : null} />
}
