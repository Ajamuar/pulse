// Sample people and invites for trying the admin dashboard locally:
//   pnpm seed:people                 (uses DATABASE_URL)
// Adds a dozen accounts (password: pulse-sample-person) with varied join dates, activity, roles and coach set-up,
// plus open, used and expired invites. Refuses NODE_ENV=production. Re-running skips accounts that exist.
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { createInvite } from "../src/server/admin";
import { getDb, migrateDb } from "../src/server/db";
import { account, coachSettings, invites, session, user } from "../src/server/db/schema";
import { ensureDefaultTags } from "../src/server/journalTags";

if (process.env.NODE_ENV === "production") {
  console.error("seed:people is for local development only.");
  process.exit(1);
}

const db = getDb();
await migrateDb(db);

const DAY = 86_400_000;
const now = Date.now();
const password = await hashPassword("pulse-sample-person");

/** name, username, joined (days ago), last active (days ago, null = signed out), role, coach set up, picked for coach */
const PEOPLE: [string, string, number, number | null, "user" | "admin", boolean, boolean][] = [
  ["Asha Rao", "asha", 58, 0, "admin", true, true],
  ["Ben Okafor", "ben.o", 51, 1, "user", true, true],
  ["Chen Wei", "chenwei", 44, 3, "user", false, true],
  ["Dana Levi", "dana", 40, null, "user", false, false],
  ["Elif Kaya", "elif.k", 33, 0, "user", true, false],
  ["Farah Siddiqui", "farah", 27, 9, "user", false, false],
  ["Gabe Moreno", "gabe", 21, 2, "user", true, true],
  ["Hana Sato", "hana", 16, 0, "user", false, false],
  ["Ivan Petrov", "ivan.p", 11, 30, "user", false, false],
  ["Jo Mensah", "jo", 6, 1, "admin", false, false],
  ["Kai Nakamura", "kai", 3, 0, "user", false, false],
  ["Lena Fischer", "lena", 1, null, "user", false, false],
];

let added = 0;
for (const [name, username, joined, active, role, coachReady, allowed] of PEOPLE) {
  const email = `${username.replace(".", "")}@example.com`;
  if ((await db.select({ id: user.id }).from(user).where(eq(user.email, email))).length) continue;
  const createdAt = new Date(now - joined * DAY);
  const [u] = await db
    .insert(user)
    .values({ name, email, emailVerified: true, username, displayUsername: username, role, coachAllowed: allowed, createdAt, updatedAt: createdAt })
    .returning({ id: user.id });
  await db.insert(account).values({ providerId: "credential", accountId: String(u.id), userId: u.id, password, updatedAt: createdAt });
  await ensureDefaultTags(db, u.id);
  if (active !== null) {
    const at = new Date(now - active * DAY);
    await db.insert(session).values({ token: randomBytes(24).toString("base64url"), userId: u.id, expiresAt: new Date(now + 30 * DAY), createdAt: at, updatedAt: at, userAgent: "seed" });
  }
  if (coachReady) await db.insert(coachSettings).values({ userId: u.id, consentAt: Math.floor(now / 1000), provider: "anthropic", model: "claude-sonnet-5-5", updatedAt: Math.floor(now / 1000) });
  added++;
}

// Invites: three waiting, two expired, and two used by people above.
const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
const by = admin?.id ?? null;
if (by !== null && (await db.select({ id: invites.id }).from(invites)).length === 0) {
  for (const label of ["Mira", "Noah", "Team offsite"]) await createInvite(db, by, label);
  for (const [label, daysAgo] of [["Old link", 12], ["Priya", 9]] as const) {
    await createInvite(db, by, label);
    await db.update(invites).set({ createdAt: Math.floor((now - daysAgo * DAY) / 1000), expiresAt: Math.floor((now - (daysAgo - 7) * DAY) / 1000) }).where(eq(invites.label, label));
  }
  for (const [label, username] of [["Kai", "kai"], ["Lena", "lena"]] as const) {
    await createInvite(db, by, label);
    const [u] = await db.select({ id: user.id, createdAt: user.createdAt }).from(user).where(eq(user.username, username));
    if (u) await db.update(invites).set({ usedAt: Math.floor(u.createdAt.getTime() / 1000), usedBy: u.id }).where(eq(invites.label, label));
  }
}

console.log(`Added ${added} sample people (password: pulse-sample-person) and sample invites.`);
process.exit(0);
