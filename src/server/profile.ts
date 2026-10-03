// The person's profile (U19): one row per user, written by onboarding and Settings › Profile.
import { z } from "zod";
import { isTimeZone } from "@/lib/timeZone";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { type Db, sql } from "./db";
import { dailyMetrics, dailyValues, profile } from "./db/schema";
import { wholeYears } from "./time";

export type Profile = {
  birthDate: string;
  sex: "male" | "female";
  maxHr: number;
  /** "set": the user's own; "google": the top of Google's latest peak zone; "estimated": 208 − 0.7 × age. */
  maxHrSource: "set" | "google" | "estimated";
  heightCm: number | null;
  /** IANA zone: the person's days start at local midnight there. */
  timeZone: string;
};

/** What onboarding and Settings submit. Ages 13 to 100: under 13 Google accounts are restricted anyway. */
export const ProfileInput = z.object({
  birthDate: z.iso.date().refine((d) => {
    const age = wholeYears(d, new Date().toISOString().slice(0, 10));
    return age >= 13 && age <= 100;
  }, "Enter a birth date between 13 and 100 years ago"),
  sex: z.enum(["male", "female"], "Choose one"),
  maxHr: z.coerce.number().int().min(100, "Between 100 and 240").max(240, "Between 100 and 240").nullable(),
  heightCm: z.coerce.number().min(100, "Between 100 and 250 cm").max(250, "Between 100 and 250 cm").nullable(),
  timeZone: z.string().refine(isTimeZone, "Choose a time zone"),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

/**
 * The stored profile with max HR resolved, or null before onboarding. Max HR: the user's own wins; else the top
 * of Google's latest PEAK zone (daily-heart-rate-zones); else Tanaka, 208 - 0.7 * age.
 */
export async function getProfile(db: Db, userId: number, today = new Date().toISOString().slice(0, 10)): Promise<Profile | null> {
  const [row] = await db.select().from(profile).where(eq(profile.userId, userId));
  if (!row) return null;
  const [google, height] = await Promise.all([row.maxHr === null ? googleMaxHr(db, userId) : null, row.heightCm ?? googleHeight(db, userId)]);
  return {
    birthDate: row.birthDate,
    sex: row.sex,
    maxHr: row.maxHr ?? google ?? Math.round(208 - 0.7 * wholeYears(row.birthDate, today)),
    maxHrSource: row.maxHr !== null ? "set" : google !== null ? "google" : "estimated",
    // The user's own height wins; else the latest from Google (sync's `height` job).
    heightCm: height,
    timeZone: row.timeZone,
  };
}

/** The peak maximum of the newest Google zones (daily_metrics.hr_zones' last number). */
const googleMaxHr = async (db: Db, userId: number) => {
  const [r] = await db
    .select({ z: dailyMetrics.hrZones })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.userId, userId), isNotNull(dailyMetrics.hrZones)))
    .orderBy(desc(dailyMetrics.day))
    .limit(1);
  const top = r?.z?.[4];
  return top != null && top >= 100 && top <= 240 ? top : null; // the range Settings accepts
};

const googleHeight = async (db: Db, userId: number) => {
  const [r] = await db
    .select({ v: dailyValues.value })
    .from(dailyValues)
    .where(and(eq(dailyValues.userId, userId), eq(dailyValues.day, "latest"), eq(dailyValues.key, "height_cm")));
  return r?.v ?? null;
};

/**
 * Saves the profile and marks every day for recompute: zones, Strain, Pulse Age and fitness level all
 * depend on age, sex and max HR. Returns true when anything changed.
 */
export async function saveProfile(db: Db, userId: number, input: ProfileInput, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const row = { ...input, updatedAt: now };
  const [before] = await db.select().from(profile).where(eq(profile.userId, userId));
  if (before && before.birthDate === row.birthDate && before.sex === row.sex && before.maxHr === row.maxHr && before.heightCm === row.heightCm && before.timeZone === row.timeZone) {
    return false;
  }
  await db.transaction(async (tx) => {
    await tx.insert(profile).values({ userId, ...row }).onConflictDoUpdate({ target: profile.userId, set: row });
    await tx.execute(sql`insert into intraday_dirty (user_id, day)
      select distinct user_id, day from daily_metrics where user_id = ${userId} on conflict do nothing`);
  });
  return true;
}

/** The user's time zone alone (one cheap read), or null before onboarding. */
export async function userTimeZone(db: Db, userId: number): Promise<string | null> {
  const [r] = await db.select({ tz: profile.timeZone }).from(profile).where(eq(profile.userId, userId));
  return r?.tz ?? null;
}
