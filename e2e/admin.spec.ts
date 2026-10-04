import { expect, test, type Browser, type Page } from "@playwright/test";

// The admin dashboard, invites and the AI coach, on the third e2e server (playwright.config.ts, project "admin"): a
// Google instance with ADMIN_EMAILS=owner@pulse.test, the scripted coach model and no accounts. Journeys in order,
// since each builds on the last. Screenshots land in test-results/admin/.
const OWNER = { name: "Olive Owner", username: "olive", email: "owner@pulse.test" };
const SAM = { name: "Sam Member", username: "sam.member", email: "sam@pulse.test" };
const PASSWORD = "e2e-password-long";

// In order: later journeys sign in as the owner the first one created.
test.describe.configure({ mode: "serial" });

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

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Onboarding: birth date and sex, then Home. */
async function onboard(page: Page) {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Birth date" }).click();
  await page.getByRole("listbox", { name: "Year" }).getByRole("option", { name: "1990", exact: true }).click();
  await page.getByRole("listbox", { name: "Month" }).getByRole("option", { name: "June", exact: true }).click();
  await page.getByRole("listbox", { name: "Day" }).getByRole("option", { name: "15", exact: true }).click();
  await page.getByText("Female", { exact: true }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Opens /admin: true when the dashboard renders, false on the not-found page (checked by content, not status). */
async function seesAdmin(p: Page) {
  await p.goto("/admin");
  const dashboard = p.getByRole("navigation", { name: "Admin" }).first();
  await expect(dashboard.or(p.getByText("This page could not be found"))).toBeVisible();
  return dashboard.isVisible();
}

const personRow = (page: Page, username: string) => page.getByRole("row").filter({ hasText: `@${username}` });
const choice = (page: Page, name: string) => page.getByRole("radio", { name: new RegExp(`^${name}`) });

test("owner starts the server, invites a member, manages people and access", async ({ page, browser }) => {
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

  // The dashboard is its own place, not part of the app: More has no Admin row.
  await page.goto("/more");
  await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByRole("region", { name: "At a glance" })).toContainText("People");
  await shot(page, "02-admin-overview");

  // Access: invite only by default.
  await page.goto("/admin/access");
  await expect(choice(page, "Invite only")).toHaveAttribute("aria-checked", "true");

  // An invite link, shown once.
  await page.goto("/admin/invites");
  await page.getByLabel("Who is it for?").fill("Sam");
  await page.getByRole("button", { name: "Create invite link" }).click();
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

  // Sam is a member: /admin is a 404.
  expect(await seesAdmin(sam)).toBe(false);

  // The owner sees who used the invite, and Sam in People.
  await page.goto("/admin/invites");
  await page.getByRole("tab", { name: /Used/ }).click();
  await expect(page.getByText(`Used by ${SAM.username}`)).toBeVisible();
  await page.goto("/admin/people");
  await expect(personRow(page, OWNER.username)).toContainText("Owner");
  await expect(personRow(page, SAM.username)).toContainText("Member");
  await page.getByPlaceholder("Search people").fill("sam");
  await expect(page.getByRole("row")).toHaveCount(2); // the header and Sam
  await page.getByPlaceholder("Search people").fill("");

  // Manage opens Sam's panel. Admin on: Sam now opens the dashboard. Off: back to a member.
  await page.getByRole("button", { name: `Manage ${SAM.name}` }).click();
  const panel = page.getByRole("dialog", { name: SAM.name });
  await expect(panel).toContainText("Signed in on");
  await panel.getByRole("switch", { name: `Admin: ${SAM.name}` }).click();
  await expect(page.getByText(`${SAM.name} is now an admin.`)).toBeVisible();
  expect(await seesAdmin(sam)).toBe(true);
  await shot(page, "06-person-panel");
  await panel.getByRole("switch", { name: `Admin: ${SAM.name}` }).click();
  await expect(page.getByText(`${SAM.name} is no longer an admin.`)).toBeVisible();
  expect(await seesAdmin(sam)).toBe(false);

  // Reset password (owners only): a temporary password, shown once; Sam is signed out and it works for signing in.
  await panel.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("dialog", { name: `Reset ${SAM.name}’s password?` }).getByRole("button", { name: "Reset password" }).click();
  const temp = await page.getByRole("textbox", { name: "Temporary password" }).inputValue();
  expect(temp).toMatch(/^[\w-]{16}$/);
  await page.getByRole("button", { name: "Done" }).click();
  expect(await (await sam.request.get("/api/auth/get-session")).json()).toBeNull();
  await sam.goto("/login");
  await sam.getByLabel("Email or username").fill(SAM.email);
  await sam.getByLabel("Password", { exact: true }).fill(temp);
  await sam.getByRole("button", { name: "Sign in" }).click();
  await expect(sam).toHaveURL(/\/$/);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(personRow(page, SAM.username)).toContainText("Member");

  // Sign-up mode: Open shows the form to anyone; Closed sends /signup to sign-in.
  await page.goto("/admin/access");
  await choice(page, "Open to anyone").click();
  await expect(choice(page, "Open to anyone")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Sign-up updated.")).toBeVisible();
  await visitor.goto("/signup");
  await expect(visitor.getByRole("button", { name: "Create account" })).toBeVisible();
  await choice(page, "Closed").click();
  await expect(choice(page, "Closed")).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(300); // the save is in flight; the toast confirms the first one already
  await visitor.goto("/signup");
  await expect(visitor).toHaveURL(/\/login$/);
  await choice(page, "Invite only").click();
  await expect(choice(page, "Invite only")).toHaveAttribute("aria-checked", "true");
  await shot(page, "07-access");

  // Delete Sam from his panel (on a phone the row opens it): a confirmation, then the account and its session are gone.
  await page.goto("/admin/people");
  await page.getByRole("button", { name: `Manage ${SAM.name}` }).click();
  await page.getByRole("dialog", { name: SAM.name }).getByRole("button", { name: `Delete ${SAM.name}` }).click();
  await expect(page.getByRole("dialog")).toContainText(`Delete ${SAM.name}’s account?`);
  await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
  // Done when the dialog closes on the server's answer (while it is open the page behind is hidden from the
  // accessibility tree, so the row would look gone too early).
  await expect(page.getByText(`${SAM.name}’s account was deleted.`)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(personRow(page, SAM.username)).toHaveCount(0);
  // Sam's browser still holds the cookie, but the session behind it is gone.
  expect(await (await sam.request.get("/api/auth/get-session")).json()).toBeNull();

  // The owner has no actions of their own (owners are changed in .env); the dashboard on a laptop.
  await expect(page.getByRole("button", { name: `Manage ${OWNER.name}` })).toHaveCount(0);
  await expect(personRow(page, OWNER.username)).toContainText("Set in .env");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await shot(page, "08-admin-laptop");
});

test("coach: an admin turns it on, the P button opens it, set-up, a question with a data card, saved chats", async ({ page }) => {
  await signIn(page);

  // Off by default: the round P button is still Check in.
  await expect(page.getByRole("button", { name: /^Check in for/ })).toBeVisible();
  expect(await (await page.goto("/coach"))?.text()).toContain("could not be found");

  // The admin turns it on for everyone; the P button now opens Coach.
  await page.goto("/admin/access");
  await choice(page, "Everyone").click();
  await expect(choice(page, "Everyone")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Coach access updated.")).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Open Coach" }).click();
  await expect(page).toHaveURL(/\/coach$/);

  // Consent, then the provider (the e2e server's scripted model needs no key).
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
  await shot(page, "09-coach-consent");
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("heading", { name: "Connect your AI provider" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Anthropic" })).toBeVisible();
  await shot(page, "10-coach-provider");
  await page.getByRole("radio", { name: "Test model" }).click();
  await page.getByRole("button", { name: "Test and save" }).click();

  // The empty chat: suggestions and the check-in. Ask one.
  await expect(page.getByRole("heading", { name: "What would you like to know?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in for today" })).toBeVisible();
  await shot(page, "11-coach-empty");
  await page.getByRole("button", { name: "Why is my recovery where it is today?" }).click();

  // The tool runs and renders Pulse's own card, then the reply.
  const log = page.getByRole("log", { name: "Chat with Pulse’s coach" });
  await expect(log.getByText("Why is my recovery where it is today?")).toBeVisible();
  await expect(log.getByText("Recovery", { exact: true })).toBeVisible();
  await expect(log.getByText("Take it easy", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/coach\?c=[\w-]+$/);
  await page.locator("textarea").blur();
  await page.emulateMedia({ colorScheme: "light" });
  await shot(page, "12-coach-answer-light");
  await page.emulateMedia({ colorScheme: "dark" });
  await shot(page, "13-coach-answer-dark");

  // Saved: a reload brings the chat back. On a phone the chats are their own page, grouped by day.
  await page.reload();
  await expect(page.getByText("Take it easy", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Chats/ }).click(); // the history icon
  await expect(page).toHaveURL(/\/coach\/chats$/);
  const chats = page.getByRole("navigation", { name: "Chats" });
  await expect(chats.getByRole("region", { name: "Today" }).getByRole("link", { name: "Why is my recovery where it is today?" })).toBeVisible();
  await shot(page, "14-coach-chats-phone");

  // Delete it from its menu, with a confirmation.
  await page.getByRole("button", { name: "Options for “Why is my recovery where it is today?”" }).click();
  await page.getByRole("menuitem", { name: "Delete chat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete chat" }).click();
  await expect(page.getByText("Chat deleted.")).toBeVisible();
  await expect(chats.getByRole("link", { name: "Why is my recovery where it is today?" })).toHaveCount(0);

  // On a laptop the chat list sits beside the conversation.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/coach");
  await page.getByRole("button", { name: "How did I sleep last night?" }).click();
  await expect(page.getByText("Take it easy", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Chats" }).getByRole("link", { name: "How did I sleep last night?" })).toBeVisible();
  await shot(page, "15-coach-laptop");
  await page.setViewportSize({ width: 390, height: 844 });

  // Settings › Coach: provider and model, never a key; the Your data page offers the chats.
  await page.goto("/settings");
  const coach = page.locator("#coach");
  await expect(coach).toContainText("Test model");
  await page.goto("/more/data");
  await expect(page.getByRole("link", { name: "JSON" }).last()).toHaveAttribute("href", "/export/coach");
});

test("coach wording: an admin edits a tool description, it is versioned, and reset brings the default back", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/coach?item=get_day");
  await expect(page.getByRole("heading", { level: 1, name: "AI coach" })).toBeVisible();
  const tool = page.locator("#tool-get_day");
  const description = tool.getByLabel("Description").first(); // the tool's; its parameter has one too
  const original = await description.inputValue();
  await description.fill("One day of the person’s scores.");
  await tool.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The coach uses it from the next message.")).toBeVisible();
  await expect(tool.getByText(/^Edited/)).toBeVisible();
  await shot(page, "16-admin-coach-edited");

  // History shows the version; Reset saves the default as the newest.
  await tool.getByRole("button", { name: /versions? of Description/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("One day of the person’s scores.");
  await page.keyboard.press("Escape");
  await tool.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByText("Back to the default.")).toBeVisible();
  await expect(tool.getByLabel("Description").first()).toHaveValue(original);
  await expect(tool.getByText("Default", { exact: true }).first()).toBeVisible();
});
