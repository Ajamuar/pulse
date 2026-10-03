// The person's profile (U19): one row in the database, written by onboarding and Settings › Profile.
import { z } from "zod";
import type { Db } from "./db";
import { profile } from "./db/schema";
import { wholeYears } from "./time";

export type Profile = {
  birthDate: string;
  sex: "male" | "female";
  maxHr: number;
  /** "set": the user's own; "google": the top of Google's latest peak zone; "estimated": 208 − 0.7 × age. */
  maxHrSource: "set" | "google" | "estimated";
  heightCm: number | null;
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
});
export type ProfileInput = z.infer<typeof ProfileInput>;

/**
 * The stored profile with max HR resolved, or null before onboarding. Max HR: the user's own wins; else the top
 * of Google's latest PEAK zone (daily-heart-rate-zones); else Tanaka, 208 - 0.7 * age.
 */
export function getProfile(db: Db, today = new Date().toISOString().slice(0, 10)): Profile | null {
  const row = db.select().from(profile).get();
  if (!row) return null;
  const google = row.maxHr === null ? googleMaxHr(db) : null;
  return {
    birthDate: row.birthDate,
    sex: row.sex,
    maxHr: row.maxHr ?? google ?? Math.round(208 - 0.7 * wholeYears(row.birthDate, today)),
    maxHrSource: row.maxHr !== null ? "set" : google !== null ? "google" : "estimated",
    // The user's own height wins; else the latest from Google (sync's `height` job).
    heightCm: row.heightCm ?? googleHeight(db),
  };
}

/** The peak maximum of the newest Google zones (daily_metrics.hr_zones' last number). */
const googleMaxHr = (db: Db) => {
  const z = db.$client.prepare("select hr_zones from daily_metrics where hr_zones is not null order by day desc limit 1").pluck().get() as string | undefined;
  const top = z ? (JSON.parse(z) as number[])[4] : undefined;
  return top != null && top >= 100 && top <= 240 ? top : null; // the range Settings accepts
};

const googleHeight = (db: Db) =>
  (db.$client.prepare("select value from daily_values where day = 'latest' and key = 'height_cm'").pluck().get() as number | undefined) ?? null;

/**
 * Saves the profile and marks every day for recompute: zones, Strain, Pulse Age and fitness level all
 * depend on age, sex and max HR. Returns true when anything changed.
 */
export function saveProfile(db: Db, input: ProfileInput, now = Math.floor(Date.now() / 1000)): boolean {
  const row = { ...input, updatedAt: now };
  const before = db.select().from(profile).get();
  if (before && before.birthDate === row.birthDate && before.sex === row.sex && before.maxHr === row.maxHr && before.heightCm === row.heightCm) {
    return false;
  }
  const c = db.$client;
  c.transaction(() => {
    db.insert(profile).values({ id: 1, ...row }).onConflictDoUpdate({ target: profile.id, set: row }).run();
    c.prepare("insert or ignore into intraday_dirty (day) select distinct day from daily_metrics").run();
  })();
  return true;
}
