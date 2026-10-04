// e2e database helper, plain Node so playwright.config.ts and e2e/days.ts can run it synchronously:
//   node e2e/db.mjs reset <db>        drop and recreate a database (fresh data each server start)
//   node e2e/db.mjs days <db>         first seeded day and the latest run before a day, as JSON
// Connects with E2E_PG_ADMIN_URL (default: the compose.dev.yaml Postgres).
import pg from "pg";

const admin = process.env.E2E_PG_ADMIN_URL ?? "postgres://pulse:pulse@localhost:5432/postgres";
const [cmd, name, before] = process.argv.slice(2);
if (!/^[a-z0-9_]+$/.test(name ?? "")) throw new Error(`bad database name: ${name}`);

if (cmd === "reset") {
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`drop database if exists ${name} with (force)`);
  await c.query(`create database ${name}`);
  await c.end();
} else if (cmd === "days") {
  const url = new URL(admin);
  url.pathname = `/${name}`;
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  const first = (await c.query("select min(day)::text as first from daily_metrics")).rows[0].first;
  const run = before
    ? (await c.query("select max(day)::text as run from exercises where type = 'RUNNING' and day < $1::date", [before])).rows[0].run
    : null;
  // The first day Home raises the illness alert (home.ts illnessRaised). The generated data follows the seed's
  // start date, so which day of the illness week crosses the line varies with the calendar.
  const illness = (
    await c.query(
      `select min(day)::text as illness from daily_scores where health_monitor->>'reason' is null and (
         health_monitor->'illness'->>'level' = 'raised' or (health_monitor->'illness'->>'level' = 'alreadyUnwell'
         and (health_monitor->'illness'->>'score')::numeric >= 50 and (health_monitor->'illness'->>'signalCount')::int >= 2))`,
    )
  ).rows[0].illness;
  await c.end();
  process.stdout.write(JSON.stringify({ first, run, illness }));
} else {
  throw new Error(`unknown command: ${cmd}`);
}
