import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("registration, catalog filters, booking, notifications and cancellation", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Full Name").fill("Campus Researcher");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`browser-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("research123!");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Find your next breakthrough." }),
  ).toBeVisible();
  await expect(page.locator(".gpu-card").first()).toBeVisible();
  await page.getByLabel("Search GPUs").fill("no-such-gpu");
  await expect(
    page.getByRole("heading", { name: "No matching resources" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Maintenance", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Reserve a time slot" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Available", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/catalog-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByRole("link", { name: "Reserve a time slot" }).first().click();
  await page
    .getByLabel("Reservation Date")
    .fill(testInfo.project.name === "desktop" ? "2099-07-10" : "2099-07-11");
  await page.getByLabel("Start Time").fill("10:00");
  await page.getByLabel("End Time").fill("11:00");
  await page
    .getByLabel("Research / Project Purpose")
    .fill("Browser testing research session");
  await page.getByRole("button", { name: "Confirm Reservation" }).click();
  await expect(
    page.getByText("Reservation created successfully!"),
  ).toBeVisible();
  await expect(
    page.getByText("Browser testing research session"),
  ).toBeVisible();
  await page.getByRole("link", { name: /Notifications/ }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.locator('.notification-item.unread')).toHaveCount(0);
  await expect(page.locator('.unread-count')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark All Read" })).toHaveCount(
    0,
  );
  await page
    .getByRole("link", { name: "My reservations", exact: true })
    .click();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('admin inventory and analytics, catalog failure recovery', async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@muj.manipal.edu');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('link', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Admin Control Panel' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add GPU', exact: true }).click();
  const form = page.locator('.inline-form');
  const model = `Browser GPU ${testInfo.project.name}`;
  await form.locator('input').nth(0).fill(model);
  await form.locator('input').nth(1).fill('24 GB');
  await form.locator('input').nth(2).fill('Testing lab');
  await page.getByRole('button', { name: 'Save GPU', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: model });
  await expect(row).toBeVisible();
  page.on('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Usage Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reservations by GPU Model' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/api/gpus', route => route.abort());
  await page.getByRole('link', { name: 'GPU catalog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catalog unavailable' })).toBeVisible();
  await page.unroute('**/api/gpus');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.gpu-card').first()).toBeVisible();
});

test("login accessibility, validation and protected routes", async ({
  page,
}, testInfo) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email", { exact: true }).fill("unknown@example.com");
  await page.getByLabel("Password", { exact: true }).fill("incorrect123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid credentials");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});
