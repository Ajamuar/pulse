// Auth contract: every Server Action and every route handler on disk refuses a signed-out caller on its own,
// without the proxy. Both lists are found by globbing, so a new action or route is covered with no edit here.
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "./config";
import { openDb, type Db } from "./db";
import { getProfile } from "./profile";
import { SESSION_COOKIE, signSession, verifySession } from "./session";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, cookie: undefined as string | undefined }));
vi.mock("./config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("./db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (h.cookie ? { name, value: h.cookie } : undefined) }) }));
const worker = vi.hoisted(() => ({ requestSync: vi.fn(), syncAndWait: vi.fn(async () => ({ ok: true, error: null })) }));
vi.mock("./worker", async (orig) => ({ ...(await orig<object>()), ...worker }));

const ROOT = process.cwd();
/** Deliberately public: liveness, the OAuth round trip, signing in and signing out. */
const PUBLIC = [/^\/healthz$/, /^\/oauth\//, /^\/login(\/|$)/, /^\/logout$/];

const demoCfg = parseConfig({ TZ: "UTC" });
const googleCfg = parseConfig({ TZ: "UTC", GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs" });

const files = (pattern: string) => fs.globSync(pattern, { cwd: ROOT }).filter((f) => !/\.test\.tsx?$/.test(f)).sort();
const actionFiles = files("src/**/*.{ts,tsx}").filter((f) => /^\s*["']use server["']/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
const routeFiles = files("src/app/**/route.ts");
/** `src/app/(group)/a/b/route.ts` → `/a/b`. */
const urlOf = (f: string) => f.replace(/^src\/app/, "").replace(/\/route\.ts$/, "").replace(/\/\([^)]+\)/g, "") || "/";

type Fn = (...args: unknown[]) => Promise<unknown>;
let actions: { name: string; fn: Fn }[] = [];
const routes: { url: string; method: string; fn: Fn }[] = [];
let db: Db;
const tables = () => db.$client.prepare("select name from sqlite_master where type = 'table' order by name").pluck().all() as string[];
const snapshot = () => tables().map((t) => JSON.stringify(db.$client.prepare(`select * from "${t}"`).raw().all())).join("\n");

/** No cookie, garbage, a token signed by another instance, and a demo token on a Google instance. */
const badSessions = async (cfg: Config) => [
  undefined,
  "not.a.jwt",
  await signSession(openDb(":memory:"), { kind: "demo" }),
  ...(cfg.google ? [await signSession(db, { kind: "demo" })] : []),
];

beforeAll(async () => {
  for (const f of actionFiles) {
    const mod = (await import(/* @vite-ignore */ path.join(ROOT, f))) as Record<string, unknown>;
    for (const [name, fn] of Object.entries(mod)) if (typeof fn === "function") actions.push({ name: `${f}#${name}`, fn: fn as Fn });
  }
  for (const f of routeFiles) {
    const mod = (await import(/* @vite-ignore */ path.join(ROOT, f))) as Record<string, unknown>;
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (typeof mod[method] === "function") routes.push({ url: urlOf(f), method, fn: mod[method] as Fn });
    }
  }
  actions = actions.sort((a, b) => a.name.localeCompare(b.name));
});

beforeEach(() => {
  db = h.db = openDb(":memory:");
  // verifySession creates the instance row on first use; made up front so it is not counted as a write.
  db.$client.prepare("insert into instance (id, session_secret) values (1, 'instance-secret-0123456789abcdef')").run();
  h.cookie = undefined;
  worker.requestSync.mockClear();
  worker.syncAndWait.mockClear();
});

describe("auth contract", () => {
  it("finds every Server Action and route handler, including the ones that had no signed-out test", () => {
    const names = actions.map((a) => a.name.split("#")[1]);
    for (const n of ["saveProfileAction", "loadCalendarMonth", "uploadAvatar", "removeAvatar", "saveJournalEntry", "saveDashboard", "disconnectGoogle"]) {
      expect(names).toContain(n);
    }
    const urls = routes.map((r) => r.url);
    for (const u of ["/status", "/sync", "/avatar", "/export/daily", "/export/backup", "/logout", "/login/demo", "/healthz"]) expect(urls).toContain(u);
  });

  it.each([
    ["demo", demoCfg],
    ["Google", googleCfg],
  ])("every Server Action refuses a signed-out caller before it reads input or writes (%s instance)", async (_, cfg) => {
    h.cfg = cfg;
    const before = snapshot();
    for (const cookie of await badSessions(cfg)) {
      h.cookie = cookie;
      for (const { name, fn } of actions) {
        // Junk arguments: the session check must come first, so they are never read.
        const out = await fn(null, new FormData()).then(
          (r) => r,
          (e: unknown) => (e instanceof Error ? e.message : e),
        );
        if (out !== "signed_out") expect(out, name).toEqual({ ok: false, error: "Signed out. Sign in again." });
      }
    }
    expect(snapshot()).toBe(before);
    expect(getProfile(db)).toBeNull();
    expect(worker.requestSync).not.toHaveBeenCalled();
    expect(worker.syncAndWait).not.toHaveBeenCalled();
  });

  it.each([
    ["demo", demoCfg],
    ["Google", googleCfg],
  ])("every route handler outside the public list answers 401 to a signed-out request (%s instance)", async (_, cfg) => {
    h.cfg = cfg;
    const before = snapshot();
    for (const cookie of await badSessions(cfg)) {
      for (const { url, method, fn } of routes) {
        if (PUBLIC.some((p) => p.test(url))) continue;
        const req = new NextRequest(`http://pulse:3000${url}?format=csv`, { method, headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });
        const res = (await fn(req, { params: Promise.resolve({}) })) as Response;
        expect(res.status, `${method} ${url}`).toBe(401);
      }
    }
    expect(snapshot()).toBe(before);
  });
});

describe("the public routes", () => {
  const route = (url: string, method: string) => routes.find((r) => r.url === url && r.method === method)!.fn;
  const post = (url: string) => route(url, "POST")(new NextRequest(`http://pulse:3000${url}`, { method: "POST" })) as Promise<Response>;

  it("/healthz answers 200 to anyone", async () => {
    h.cfg = googleCfg;
    const res = (await route("/healthz", "GET")(new NextRequest("http://pulse:3000/healthz"))) as Response;
    expect(res.status).toBe(200);
  });

  it("/logout signs a signed-out visitor out anyway: 303 to /login and the cookie cleared", async () => {
    h.cfg = googleCfg;
    const res = await post("/logout");
    expect(res.status).toBe(303);
    // Relative, never the container's own address (behind a tunnel request.url is http://0.0.0.0:3000).
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)`, "i"));
  });

  it("/login/demo signs a visitor in on a demo instance only", async () => {
    h.cfg = googleCfg;
    const refused = await post("/login/demo");
    expect(refused.status).toBe(404);
    expect(refused.headers.get("set-cookie")).toBeNull();

    h.cfg = demoCfg;
    const res = await post("/login/demo");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const token = res.headers.get("set-cookie")!.match(new RegExp(`^${SESSION_COOKIE}=([^;]+)`))![1];
    expect(await verifySession(db, token, { googleEnabled: false })).toEqual({ kind: "demo" });
  });
});
