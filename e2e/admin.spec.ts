import { expect, test, type Browser, type Page } from "@playwright/test";

// The admin panel and invites, on the third e2e server (playwright.config.ts, project "admin"): a Google
// instance with ADMIN_EMAILS=owner@pulse.test and no accounts. One journey, in order, since each step builds on
// the last. Screenshots land in test-results/admin/.
const OWNER = { name: "Olive Owner", username: "olive", email: "owner@pulse.test" };
const SAM = { name: "Sam Member", username: "sam.member", email: "sam@pulse.test" };
const PASSWORD = "e2e-password-long";

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/admin/${name}.png`, fullPage: true });

/** A signed-out phone in its own browser context. */
async function guest(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  return ctx.newPage();
}

async function signUp(page: Page, who: { name: string; username: string; email: string }) {
  await page.getByLabel("Name", { exact: true }).fill(who.name);
  await page.getByLabel("Username", { exact: true }).fill(who.username);
  await page.getByLabel("Email", { exact: true }).fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Onboarding: birth date and sex, then Home. */
async function onboard(page: Page) {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Birth date" }).click();
  await page.getByRole("button", { name: "1990", exact: true }).click();
  await page.getByRole("button", { name: "Jun", exact: true }).click();
  await page.getByRole("dialog").getByText("15", { exact: true }).click();
  await page.getByText("Female", { exact: true }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/**
 * Opens /admin: true when the panel renders, false when it's the not-found page. Checked by content, not status:
 * the route's loading.tsx starts the stream, so notFound() renders the 404 page inside a 200 response.
 */
async function seesAdmin(p: Page) {
  await p.goto("/admin");
  const panel = p.getByRole("radiogroup", { name: "Who can sign up" });
  await expect(panel.or(p.getByText("This page could not be found"))).toBeVisible();
  return panel.isVisible();
}

const accountRow =(page: Page, username: string) => page.getByRole("listitem").filter({ hasText: `@${username}` });

test("owner starts the server, invites a member, manages accounts and the sign-up mode", async ({ page, browser }) => {
  // A new server: the form shows, but only the ADMIN_EMAILS address may use it without an invite.
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByText("This server has no accounts yet")).toBeVisible();
  await shot(page, "01-new-server-signup");
  await signUp(page, SAM);
  await expect(page.getByText("Sign-up here needs an invite link")).toBeVisible();

  await page.reload();
  await signUp(page, OWNER);
  await onboard(page);

  // More › Admin, then the panel: invite-only by default.
  await page.goto("/more");
  await page.getByRole("link", { name: /Admin/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("radio", { name: "Invite only" })).toHaveAttribute("aria-checked", "true");
  await expect(accountRow(page, OWNER.username)).toContainText("Owner");
  await shot(page, "02-admin-panel");

  // An invite link, shown once.
  await page.getByLabel("For (optional)").fill("Sam");
  await page.getByRole("button", { name: "Create link" }).click();
  const linkField = page.getByLabel("Invite link");
  await expect(linkField).toHaveValue(/\/signup\?invite=[\w-]{24}$/);
  const link = await linkField.inputValue();
  await shot(page, "03-invite-created");

  // Without the link, a visitor is told it's invite-only.
  const visitor = await guest(browser);
  await visitor.goto("/signup");
  await expect(visitor.getByRole("heading", { name: "Pulse here is invite-only" })).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await shot(visitor, "04-signup-without-invite");

  // With it, Sam signs up and onboards; the same link then no longer works.
  const sam = await guest(browser);
  await sam.goto(link);
  await expect(sam.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await signUp(sam, SAM);
  await onboard(sam);
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { name: "This invite has expired" })).toBeVisible();
  await shot(visitor, "05-invite-used");

  // Sam is a member: no Admin row on More, and /admin is a 404.
  await sam.goto("/more");
  await expect(sam.getByRole("link", { name: /Admin/ })).toHaveCount(0);
  expect(await seesAdmin(sam)).toBe(false);

  // The owner sees who used the invite, and Sam in Accounts.
  await page.reload();
  await expect(page.getByText(`by ${SAM.username}`)).toBeVisible();
  await expect(accountRow(page, SAM.username)).toBeVisible();

  // Make admin: Sam now opens the panel. Remove admin: back to a member.
  await page.getByRole("button", { name: `Actions for ${SAM.name}` }).click();
  await page.getByRole("menuitem", { name: "Make admin" }).click();
  await expect(accountRow(page, SAM.username)).toContainText("Admin");
  expect(await seesAdmin(sam)).toBe(true);
  await shot(page, "06-member-made-admin");
  await page.getByRole("button", { name: `Actions for ${SAM.name}` }).click();
  await page.getByRole("menuitem", { name: "Remove admin" }).click();
  await expect(accountRow(page, SAM.username)).not.toContainText("Admin");
  expect(await seesAdmin(sam)).toBe(false);

  // Sign-up mode: Open shows the form to anyone; Closed sends /signup to sign-in.
  await page.getByRole("radio", { name: "Open" }).click();
  await expect(page.getByText("Anyone who can reach this server")).toBeVisible();
  await visitor.goto("/signup");
  await expect(visitor.getByRole("button", { name: "Create account" })).toBeVisible();
  await page.getByRole("radio", { name: "Closed" }).click();
  await expect(page.getByText("Nobody can create an account")).toBeVisible();
  await visitor.goto("/signup");
  await expect(visitor).toHaveURL(/\/login$/);
  await page.getByRole("radio", { name: "Invite only" }).click();
  await expect(page.getByText("need an invite link from an admin")).toBeVisible();

  // Delete Sam: a confirmation, then the account and its session are gone.
  await page.getByRole("button", { name: `Actions for ${SAM.name}` }).click();
  await page.getByRole("menuitem", { name: "Delete account…" }).click();
  await expect(page.getByRole("dialog")).toContainText(`Delete ${SAM.name}’s account?`);
  await shot(page, "07-delete-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
  await expect(accountRow(page, SAM.username)).toHaveCount(0);
  await sam.goto("/"); // the shell streams first (skeletons, no data); the layout then redirects the dead session
  await expect(sam).toHaveURL(/\/login$/, { timeout: 30_000 });

  // The owner has no menu of their own (owners are changed in .env), and the panel on a laptop.
  await expect(page.getByRole("button", { name: `Actions for ${OWNER.name}` })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "08-admin-panel-laptop");
});
