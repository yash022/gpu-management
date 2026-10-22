import { test, expect } from '@playwright/test';
test('repeated submissions send one login request and show progress', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('pending@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  let requests = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/auth/login', async route => {
    requests++; await pending;
    await route.fulfill({ status: 400, json: { message: 'Invalid credentials.' } });
  });
  try {
    await page.locator('form').evaluate(form => {
      form.requestSubmit(); form.requestSubmit(); form.requestSubmit();
    });
    await expect(page.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
    await expect.poll(() => requests).toBe(1);
  } finally { release(); }
  await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});
