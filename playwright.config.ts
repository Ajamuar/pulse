import { defineConfig, devices } from "@playwright/test";
import { E2E_DB, e2eUrl } from "./e2e/days";

// The e2e server is a second `next dev` on its own port, build dir and throwaway Postgres database (on the
// compose.dev.yaml server, or CI's service container), so it never touches the dev server on :3000 or its data. The `setup` project signs in to the
// demo once and every other project reuses that session (STORAGE).
const PORT = 3300;

const STORAGE = "test-results/.auth/demo.json";

const env = {
  GOOGLE_OAUTH_ENABLED: "false",
  DATABASE_URL: e2eUrl(E2E_DB),
  BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnop",
  NEXT_DIST_DIR: ".next/e2e",
  PORT: String(PORT),
};

// The onboarding journey needs a demo with no profile. The main server seeds one at sign-in, and its
// projects share that profile, so removing it there would send parallel tests to /onboarding. Instead a
// second server, on its own port and DB, runs with E2E_NO_DEMO_PROFILE=1: the demo then skips seeding
// a profile (src/server/sources/seed/generate.ts). It adds no route and deletes nothing, and only this
// file sets the flag. Under E2E_PROD it serves the main server's build (webServers start in order).
const ONBOARDING_PORT = 3301;
const ONBOARDING_DB = "pulse_e2e_onboarding";

// Journeys run at one phone and one laptop width; the sweep runs everywhere. onboarding.spec.ts runs only
// in its own project, against the second server.
const JOURNEYS = new Set(["390", "1440"]);
const ignored = (name: string) => [...(JOURNEYS.has(name) ? [] : ["**/journeys.spec.ts", "**/auth.spec.ts"]), "**/onboarding.spec.ts"];
const touch = (name: string, width: number, height: number, deviceScaleFactor = 3) => ({
  name,
  testIgnore: ignored(name),
  dependencies: ["setup"],
  use: { viewport: { width, height }, deviceScaleFactor, hasTouch: true, isMobile: true, storageState: STORAGE },
});
const desktop = (name: string, width: number, height: number) => ({
  name,
  testIgnore: ignored(name),
  dependencies: ["setup"],
  use: { viewport: { width, height }, deviceScaleFactor: 1, storageState: STORAGE },
});

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Dev compiles on demand; a few workers keep it from thrashing.
  workers: 4,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "auth.setup.ts" },
    touch("361", 361, 800, 3.5), // a common narrow Android phone
    touch("390", 390, 844),
    touch("820", 820, 1180, 2),
    desktop("1440", 1440, 900),
    desktop("1920", 1920, 1080),
    {
      name: "onboarding",
      testMatch: "onboarding.spec.ts",
      use: {
        baseURL: `http://localhost:${ONBOARDING_PORT}`,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
  webServer: [
    {
      // Fresh DB each start: the worker seeds 180 days ending today on boot. E2E_PROD=1 (CI) tests a production
      // build: every page compiled once up front instead of on first hit, which is several times faster on a
      // 2-core runner, and it is what gets deployed.
      command: `node e2e/db.mjs reset ${E2E_DB} && ${
        process.env.E2E_PROD ? `pnpm exec next build && pnpm exec next start -p ${PORT}` : `pnpm exec next dev -p ${PORT}`
      }`,
      url: `http://localhost:${PORT}/healthz`,
      env,
      // Reuse only the e2e server itself (same port) while iterating locally; CI always starts fresh.
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `node e2e/db.mjs reset ${ONBOARDING_DB} && ${
        process.env.E2E_PROD ? `pnpm exec next start -p ${ONBOARDING_PORT}` : `pnpm exec next dev -p ${ONBOARDING_PORT}`
      }`,
      url: `http://localhost:${ONBOARDING_PORT}/healthz`,
      env: {
        ...env,
        DATABASE_URL: e2eUrl(ONBOARDING_DB),
        PORT: String(ONBOARDING_PORT),
        // next dev locks its build dir, so dev needs a second one; next start reads the main build.
        NEXT_DIST_DIR: process.env.E2E_PROD ? env.NEXT_DIST_DIR : ".next/e2e-onboarding",
        E2E_NO_DEMO_PROFILE: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
