import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function register(page, suffix) {
  await page.goto("/register");
  const email = `auth-${suffix}-${Date.now()}@example.com`;
  await page.getByLabel("Full Name").fill("Auth Researcher");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("auth-password-123");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  return email;
}
async function signIn(page, email, remember = false) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("auth-password-123");
  if (remember) await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("protected destination, show password, remembered session and refresh", async ({
  page,
  context,
}, info) => {
  const email = await register(page, info.project.name);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("signed out");
  await page.goto("/book/1");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Password", { exact: true }).fill("auth-password-123");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await signIn(page, email, true);
  await expect(page).toHaveURL(/book\/1/);
  await expect(
    page.getByRole("heading", { name: "Make room for your next idea." }),
  ).toBeVisible();
  const session = (await context.cookies()).find(
    (c) => c.name === "gpuspace_session",
  );
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
  expect(session.expires).toBeGreaterThan(Date.now() / 1000);
  expect(
    await page.evaluate(() => ({
      local: localStorage.getItem("token"),
      session: sessionStorage.getItem("token"),
      cookies: document.cookie,
    })),
  ).toEqual({ local: null, session: null, cookies: "" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make room for your next idea." }),
  ).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/dashboard/);
});
test("logout syncs across tabs and back navigation cannot restore private pages", async ({
  page,
  context,
}, info) => {
  await register(page, `tabs-${info.project.name}`);
  const other = await context.newPage();
  await other.goto("/reservations");
  await expect(
    other.getByRole("heading", { name: "My reservations & queue" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "My reservations", exact: true })
    .click();
  await page.getByRole("link", { name: /Notifications/ }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await expect(other).toHaveURL(/login/);
  await page.goBack();
  await expect(page).toHaveURL(/login/);
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await other.close();
});
test("offline logout shows retry and does not claim success", async ({
  page,
}, info) => {
  await register(page, `offline-${info.project.name}`);
  await page.route("**/api/auth/logout", (route) => route.abort());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "could not reach the server",
  );
  await expect(page).toHaveURL(/dashboard/);
  await page.unroute("**/api/auth/logout");
  await page.getByRole("button", { name: "Retry sign out" }).click();
  await expect(page).toHaveURL(/login/);
});
test("session verification outage is recoverable without losing the session", async ({
  page,
}, info) => {
  await register(page, `recovery-${info.project.name}`);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Let us reconnect." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/dashboard/);
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(
    page.getByRole("heading", { name: "Find your next breakthrough." }),
  ).toBeVisible();
});
test("expired session displays explanation; login rate limiting and network errors are clear", async ({
  page,
}, info) => {
  await register(page, `expiry-${info.project.name}`);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { code: "SESSION_EXPIRED" } }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/login/);
  await expect(page.getByRole("status")).toContainText("expired");
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": "120" },
      json: { message: "Too many attempts" },
    }),
  );
  await signIn(page, "rate@example.com");
  await expect(page.getByRole("alert")).toContainText("2 minutes");
  await page.unroute("**/api/auth/login");
  await page.route("**/api/auth/login", (route) => route.abort());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "could not reach the server",
  );
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});
test("sign out on all devices revokes another browser session", async ({
  page,
  browser,
}, info) => {
  const email = await register(page, `devices-${info.project.name}`);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto("http://127.0.0.1:5174/login");
    await signIn(other, email);
    await expect(other).toHaveURL(/dashboard/);
    await page.getByRole("button", { name: "Session options" }).click();
    await page
      .getByRole("button", { name: "Sign out on all devices", exact: true })
      .click();
    await expect(page).toHaveURL(/login/);
    await other.reload();
    await expect(other).toHaveURL(/login/);
  } finally {
    await otherContext.close();
  }
});
