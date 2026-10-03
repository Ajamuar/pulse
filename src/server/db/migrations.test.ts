// Upgrades from every earlier schema with data in it, and a guard against SQL that throws data away. The
// migrator reads only meta/_journal.json and the SQL files, so a copy of drizzle/ with a shortened journal
// recreates any earlier schema; openDb then runs the rest exactly as a boot does.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { openDb } from "./index";

const DRIZZLE = path.join(process.cwd(), "drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-migrations-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/**
 * Rows written right after migration k, in SQL valid at that schema: every table it creates, every column it
 * adds. A new migration must add its entry here (the count is checked), so its upgrade path is tested with data.
 */
const MIGRATION_FIXTURES: string[] = [
  /* 0000_init */ `
  insert into daily_metrics (day, hrv_ms, hrv_deep_ms, rhr_bpm, rhr_method, resp_bpm, nightly_temp_c, spo2_pct, steps, calories, source)
    values ('2026-01-01', 55.5, 60.25, 52, 'session', 14.2, -0.3, 97, 8000, 2100.5, 'google');
  insert into daily_scores (day, scoring_version, strain, recovery, sleep) values ('2026-01-01', 3, '{"effort":40}', '{"value":70}', '{"performance":88}');
  insert into exercises (id, day, start_ts, end_ts, type, name, calories, distance_m, source)
    values ('ex1', '2026-01-01', 1767250800, 1767254400, 'run', 'Morning run', 400, 8000, 'google');
  insert into hr_samples (ts, bpm) values (1767250800, 120), (1767250815, 121);
  insert into intraday_dirty (day) values ('2026-01-02');
  insert into intraday_series (day, kind, data) values ('2026-01-01', 'hr', '[60,61]');
  insert into journal_tags (tag, label, is_default) values ('cold_plunge', 'Cold plunge', 1), ('custom_x', 'My own tag', 0);
  insert into journal_entries (day, tag, value) values ('2026-01-01', 'custom_x', 1), ('2026-01-01', 'cold_plunge', 0);
  insert into oauth_tokens (id, access_token, refresh_token, expires_at, scope, updated_at) values (1, 'at', 'rt', 1, 'scope', 1);
  insert into raw_payloads (type, range_start, range_end, body_hash, gz_body, fetched_at) values ('heart-rate', 0, 1, 'h1', x'1f8b0800', 1);
  insert into reports (period, data) values ('2026-W01', '{"avg":1}');
  insert into sleep_sessions (id, day, start_ts, end_ts, is_main, processed, stages_status, asleep_min, deep_min, source)
    values ('s1', '2026-01-01', 1767218400, 1767247200, 1, 1, 'ok', 450, 80, 'google');
  insert into sleep_segments (session_id, start_ts, end_ts, stage) values ('s1', 1767218400, 1767222000, 'light'), ('s1', 1767222000, 1767225600, 'deep');
  insert into steps_minutes (ts, steps) values (1767250800, 90);
  insert into sync_state (type, synced_through, backfill_days_done, backfill_days_total, last_error) values ('heart-rate', 1767250800, 180, 180, 'http_503');`,
  /* 0001_auth_profile */ `
  insert into instance (id, session_secret, owner_email) values (1, 'secret', 'me@example.com');
  insert into profile (id, birth_date, sex, max_hr, height_cm, updated_at) values (1, '1990-01-01', 'female', 185, 170.5, 1);`,
  /* 0002_avatar */ `
  update instance set owner_picture = 'https://example.com/p', avatar = x'89504e47', avatar_type = 'image/png', avatar_at = 2;`,
  /* 0003_journal_tag_order */ `
  update journal_tags set hidden = 1, position = 2 where tag = 'custom_x';`,
  /* 0004_dashboard_metrics */ `
  insert into dashboard_metrics (key, position) values ('recovery', 0), ('hrv', 1);`,
  /* 0005_raw_payloads_retention */ `
  insert into raw_payloads (type, range_start, range_end, body_hash, gz_body, fetched_at) values ('sleep', 0, 1, 'h2', x'1f8b0801', 2);`,
  /* 0006_google_extras */ `
  insert into daily_values (day, key, value) values ('2026-01-01', 'floors', 12);
  insert into health_records (id, kind, ts, day, data) values ('ecg1', 'ecg', 1767250800, '2026-01-01', '{"result":"normal"}');`,
  /* 0007_logged_entries */ `
  insert into logged_entries (id, type, ts, day, data, google_name, created_at)
    values ('log1', 'hydration-log', 1767250800, '2026-01-01', '{"ml":250}', 'users/me/dataTypes/hydration-log/dataPoints/1', 1767250800);`,
  /* 0008_google_first_inputs */ `
  update daily_metrics set hr_zones = '[98,118,137,157,186]', light_moderate_min = 42, vigorous_peak_min = 7.5, temp_baseline_c = 34.2,
    temp_sd_c = 0.18, rhr_range_low = 50, rhr_range_high = 58, hrv_range_low = 38.5, hrv_range_high = 66 where day = '2026-01-01';`,
  /* 0009_owner_name */ `
  update instance set owner_name = 'Test Owner';`,
  /* 0010_password_account */ `
  update instance set password_hash = 'scrypt$16384$8$5$c2FsdA$a2V5', google_email = 'fit@gmail.com';`,
];

type Conn = Database.Database;
const tablesOf = (c: Conn) =>
  c.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").pluck().all() as string[];
const columnsOf = (c: Conn, t: string) => c.prepare(`select name from pragma_table_info('${t}')`).pluck().all() as string[];
/** Every row of `t`, reading only `cols`, in a stable order. */
const rows = (c: Conn, t: string, cols: string[]) => {
  const list = cols.map((x) => `"${x}"`).join(", ");
  return c.prepare(`select ${list} from "${t}" order by ${list}`).raw().all();
};
/** Columns, indexes and foreign keys per table: what a fresh database and an upgraded one must agree on. */
const shape = (c: Conn) =>
  Object.fromEntries(
    tablesOf(c)
      .filter((t) => t !== "__drizzle_migrations")
      .map((t) => [
        t,
        {
          columns: c.prepare(`select name, type, "notnull", dflt_value, pk from pragma_table_info('${t}') order by cid`).all(),
          indexes: c.prepare(`select name, "unique", origin, partial from pragma_index_list('${t}') order by name`).all(),
          foreignKeys: c.prepare(`select "table", "from", "to", on_update, on_delete from pragma_foreign_key_list('${t}') order by id`).all(),
          withoutRowid: /without rowid\s*$/i.test(c.prepare("select sql from sqlite_master where name = ?").pluck().get(t) as string),
        },
      ]),
  );

/** A database migrated up to and including migration k, with the fixtures of 0..k in it. */
function atVersion(k: number): string {
  const folder = path.join(dir, `drizzle-${k}`);
  fs.cpSync(DRIZZLE, folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, k + 1) }));
  const file = path.join(dir, `v${k}.db`);
  const c = new Database(file);
  c.pragma("foreign_keys = ON");
  migrate(drizzle(c), { migrationsFolder: folder });
  for (let j = 0; j <= k; j++) c.exec(MIGRATION_FIXTURES[j]);
  c.close();
  return file;
}

describe("migrations", () => {
  it("every migration has a fixture", () => {
    expect(MIGRATION_FIXTURES).toHaveLength(journal.entries.length);
  });

  const fresh = () => openDb(path.join(dir, `fresh-${Math.random()}.db`)).$client;

  it.each(journal.entries.slice(0, -1).map((e) => [e.tag, e.idx]))("upgrades from %s with data in every table, losing nothing", (_, k) => {
    const file = atVersion(k);
    const old = new Database(file, { readonly: true });
    const before = Object.fromEntries(tablesOf(old).map((t) => [t, { cols: columnsOf(old, t), rows: rows(old, t, columnsOf(old, t)) }]));
    old.close();

    const up = openDb(file).$client; // what a boot does
    for (const [t, { cols, rows: was }] of Object.entries(before)) {
      if (t === "__drizzle_migrations") continue;
      expect(rows(up, t, cols), `${t} after upgrading from ${k}`).toEqual(was);
    }
    expect(shape(up)).toEqual(shape(fresh()));
    expect(up.prepare("select count(*) from __drizzle_migrations").pluck().get()).toBe(journal.entries.length);
    expect(up.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(up.pragma("foreign_key_check")).toEqual([]);
    up.close();
  });

  it("the fixtures cover every table of the latest schema", () => {
    const c = new Database(atVersion(journal.entries.length - 1), { readonly: true });
    const empty = tablesOf(c).filter((t) => t !== "__drizzle_migrations" && c.prepare(`select count(*) from "${t}"`).pluck().get() === 0);
    c.close();
    expect(empty).toEqual([]);
  });
});

/**
 * Migrations that may drop or rename, with the reason. Drizzle's SQLite table rebuild (create `__new_t`, copy,
 * drop `t`, rename) needs no entry when the copy keeps every column `t` had.
 */
const DESTRUCTIVE_OK: Record<string, string> = {};

describe("destructive SQL guard", () => {
  const snapshotTables = (idx: number) =>
    (JSON.parse(fs.readFileSync(path.join(DRIZZLE, `meta/${String(idx).padStart(4, "0")}_snapshot.json`), "utf8")) as {
      tables: Record<string, { columns: Record<string, unknown> }>;
    }).tables;

  it.each(journal.entries.map((e) => [e.tag, e.idx]))("%s drops, renames or deletes nothing it should keep", (tag, idx) => {
    if (DESTRUCTIVE_OK[tag]) return;
    const statements = fs
      .readFileSync(path.join(DRIZZLE, `${tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim().replace(/\s+/g, " "));
    const copied = new Map<string, string[]>(); // table -> columns its __new_ rebuild copies
    for (const s of statements) {
      const copy = s.match(/^INSERT INTO [`"]?__new_(\w+)[`"]?\s*\(([^)]*)\)\s*SELECT/i);
      if (copy) copied.set(copy[1], copy[2].split(",").map((c) => c.trim().replace(/[`"]/g, "")));
      const drop = s.match(/^DROP TABLE [`"]?(\w+)[`"]?/i);
      if (drop) {
        const had = Object.keys(snapshotTables(idx - 1)[drop[1]]?.columns ?? {});
        expect(copied.has(drop[1]), `${tag}: DROP TABLE ${drop[1]} with no rebuild copy`).toBe(true);
        expect(copied.get(drop[1]), `${tag}: the rebuild of ${drop[1]} drops columns`).toEqual(expect.arrayContaining(had));
        continue;
      }
      if (/^ALTER TABLE [`"]?__new_(\w+)[`"]? RENAME TO [`"]?\1[`"]?/i.test(s)) continue; // the rebuild's last step
      expect(s, `${tag}: drops, renames or deletes data`).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b|\bRENAME\b|^DELETE\b|^UPDATE\b/i);
    }
  });
});
