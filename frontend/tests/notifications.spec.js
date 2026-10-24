import { test, expect } from '@playwright/test';

test('notifications recover from load and update failures without stale errors', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    user: { id: 1, name: 'Notification Tester', email: 'notifications@example.com', role: 'student' },
    csrfToken: 'test-csrf',
  } }));
  let failLoad = true;
  let failUpdate = true;
  let read = false;
  await page.route('**/api/notifications', route => failLoad
    ? route.fulfill({ status: 503, json: { message: 'Notifications temporarily unavailable.' } })
    : route.fulfill({ json: [{ id: 1, message: 'Your booking is confirmed.', type: 'booking_confirmed', is_read: read }] }));
  await page.route('**/api/notifications/1/read', route => {
    if (failUpdate) return route.fulfill({ status: 503, json: { message: 'Update temporarily unavailable.' } });
    read = true;
    return route.fulfill({ json: { message: 'Notification marked as read' } });
  });
  await page.goto('/notifications');
  await expect(page.getByRole('alert')).toContainText('Notifications temporarily unavailable.');
  await expect(page.getByText('No notifications found.')).toHaveCount(0);
  failLoad = false;
  await page.getByRole('button', { name: 'Retry notifications' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const notification = page.getByRole('button', { name: 'Mark as read: Your booking is confirmed.' });
  await notification.click();
  await expect(page.getByRole('alert')).toContainText('Update temporarily unavailable.');
  await expect(notification).toBeVisible();
  failUpdate = false;
  await notification.click();
  await expect(page.getByRole('button', { name: 'Read: Your booking is confirmed.' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
