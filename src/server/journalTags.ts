// The Journal's default behaviours, shared by both data sources.
import { and, eq, inArray } from "drizzle-orm";
import { type Db, sql } from "./db";
import { journalTags } from "./db/schema";

export const DEFAULT_JOURNAL_TAGS = [
  { tag: "alcohol", label: "Alcohol" },
  { tag: "late_caffeine", label: "Late caffeine" },
  { tag: "late_meal", label: "Late meal" },
  { tag: "screen_in_bed", label: "Screen in bed" },
  { tag: "meditation", label: "Meditation" },
  { tag: "stretching", label: "Stretching" },
  { tag: "sauna", label: "Sauna" },
  { tag: "travel", label: "Travel" },
  { tag: "illness", label: "Illness" },
] as const;

/** Inserts any missing default tag for the user; existing rows (and custom tags) are left alone. Returns rows inserted. */
export async function ensureDefaultTags(db: Db, userId: number): Promise<number> {
  const added = await db
    .insert(journalTags)
    .values(DEFAULT_JOURNAL_TAGS.map(({ tag, label }) => ({ userId, tag, label, isDefault: true })))
    .onConflictDoNothing()
    .returning({ tag: journalTags.tag });
  return added.length;
}

/** A custom tag's key: the label as snake_case ("Cold plunge" → "cold_plunge"); "" when it has no letter or digit. */
export const tagKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Adds a custom tag at the end of its group. False when the key already exists. */
export async function addTag(db: Db, userId: number, tag: string, label: string): Promise<boolean> {
  const added = await db
    .insert(journalTags)
    .values({
      userId,
      tag,
      label,
      position: sql`(select coalesce(max(position), 0) + 1 from journal_tags where user_id = ${userId})`,
    })
    .onConflictDoNothing()
    .returning({ tag: journalTags.tag });
  return added.length > 0;
}

/** Hides a tag from the check-in sheet or shows it again. Its answers are untouched. False for an unknown tag. */
export async function setTagHidden(db: Db, userId: number, tag: string, hidden: boolean): Promise<boolean> {
  const r = await db
    .update(journalTags)
    .set({ hidden })
    .where(and(eq(journalTags.userId, userId), eq(journalTags.tag, tag)))
    .returning({ tag: journalTags.tag });
  return r.length > 0;
}

/**
 * Orders `tags` (one check-in group, in its new order) by writing their positions 0..n-1. Other groups keep
 * theirs: groups render apart, so only the order inside a group matters. False, writing nothing, if any tag is unknown.
 */
export async function reorderTags(db: Db, userId: number, tags: string[]): Promise<boolean> {
  if (new Set(tags).size !== tags.length) return false;
  if (!tags.length) return true;
  const known = await db
    .select({ tag: journalTags.tag })
    .from(journalTags)
    .where(and(eq(journalTags.userId, userId), inArray(journalTags.tag, tags)));
  if (known.length !== tags.length) return false;
  await db.transaction(async (tx) => {
    for (const [i, t] of tags.entries()) {
      await tx.update(journalTags).set({ position: i }).where(and(eq(journalTags.userId, userId), eq(journalTags.tag, t)));
    }
  });
  return true;
}
