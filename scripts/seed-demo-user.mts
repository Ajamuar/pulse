// Fills an account with 180 days of generated data, so every screen can be tried without a Fitbit.
//   pnpm seed:demo                    the demo account (demo@pulse.local / pulse-demo-generated-data), created if needed
//   pnpm seed:demo <username|email>   an existing account, e.g. a test user
// In the image: docker exec pulse node scripts/seed-user.mjs <username|email>
// Refuses an account that has connected Google, so generated data never mixes with real data. Re-running tops the
// data up to today. Uses DATABASE_URL.
import { eq, or } from "drizzle-orm";
import { getDb, migrateDb } from "../src/server/db";
import { oauthTokens, user } from "../src/server/db/schema";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../src/server/demo";
import { ensureDefaultTags } from "../src/server/journalTags";
import { recompute } from "../src/server/pipeline";
import { getProfile, saveProfile } from "../src/server/profile";
import { DEMO_PROFILE, ensureDemoUser, seedPull } from "../src/server/sources/seed/generate";

const target = process.argv[2]?.trim().toLowerCase();
const db = getDb();
await migrateDb(db);

let userId: number;
if (!target) userId = await ensureDemoUser(db);
else {
  const [u] = await db.select({ id: user.id }).from(user).where(or(eq(user.email, target), eq(user.username, target)));
  if (!u) {
    console.error(`No account with the email or username "${target}".`);
    process.exit(1);
  }
  userId = u.id;
}
const [grant] = await db.select({ userId: oauthTokens.userId }).from(oauthTokens).where(eq(oauthTokens.userId, userId));
if (grant) {
  console.error("This account has connected Google; refusing to add generated data to real data.");
  process.exit(1);
}

await ensureDefaultTags(db, userId);
if (!(await getProfile(db, userId))) await saveProfile(db, userId, { ...DEMO_PROFILE });
const profile = (await getProfile(db, userId))!;
await seedPull(db, { userId, timeZone: profile.timeZone, maxHr: profile.maxHr });
const run = await recompute(db, { userId, timeZone: profile.timeZone, profile });
console.log(`Seeded user ${userId}: ${run.stage1Days.length} days scored in ${run.ms} ms.`);
if (!target) console.log(`Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
process.exit(0);
