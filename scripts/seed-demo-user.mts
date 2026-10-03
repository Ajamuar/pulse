// Local testing on a Google-mode instance: creates the demo account with 180 days of generated data, so you can
// sign in with a password and see every screen without connecting Google.
//   pnpm seed:demo        then sign in as demo@pulse.local / pulse-demo-generated-data
// Uses DATABASE_URL (default: the compose.dev.yaml Postgres). Re-running tops the data up to today.
import { DEMO_EMAIL, DEMO_PASSWORD } from "../src/server/auth";
import { getDb, migrateDb } from "../src/server/db";
import { ensureDefaultTags } from "../src/server/journalTags";
import { recompute } from "../src/server/pipeline";
import { getProfile, saveProfile } from "../src/server/profile";
import { DEMO_PROFILE, ensureDemoUser, seedPull } from "../src/server/sources/seed/generate";

const db = getDb();
await migrateDb(db);
const userId = await ensureDemoUser(db);
await ensureDefaultTags(db, userId);
if (!(await getProfile(db, userId))) await saveProfile(db, userId, { ...DEMO_PROFILE });
const profile = (await getProfile(db, userId))!;
await seedPull(db, { userId, timeZone: profile.timeZone, maxHr: profile.maxHr });
const run = await recompute(db, { userId, timeZone: profile.timeZone, profile });
console.log(`Demo account ready (user ${userId}, ${run.stage1Days.length} days scored in ${run.ms} ms).`);
console.log(`Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
process.exit(0);
