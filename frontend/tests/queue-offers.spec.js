import { test, expect } from '@playwright/test';

test('queue offer protects a slot and Book Now prefills the exact held times', async ({ page, request }, testInfo) => {
  const login = await request.post('/api/auth/login', {
    headers: { 'X-Requested-With': 'GPUspace' },
    data: { email: 'admin@muj.manipal.edu', password: 'admin123' },
  });
  expect(login.status()).toBe(200);
  const headers = { 'X-Requested-With': 'GPUspace', 'X-CSRF-Token': (await login.json()).csrfToken };
  const gpuResponse = await request.post('/api/gpus', { headers, data: {
    model: `Offer GPU ${testInfo.project.name}`, vram: '16 GB', location: 'Test lab', status: 'available',
  } });
  expect(gpuResponse.status()).toBe(201);
  const gpu = await gpuResponse.json();
  const slot = { gpu_id: gpu.id, date: '2099-10-12', start_time: '10:00', end_time: '11:00', purpose: 'Original slot' };
  const original = await request.post('/api/reservations', { headers, data: slot });
  expect(original.status()).toBe(201);
  const booking = await original.json();

  await page.goto('/register');
  await page.getByLabel('Full Name').fill('Waiting researcher');
  await page.getByLabel('Email', { exact: true }).fill(`offer-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('queue-test-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find your next breakthrough.' })).toBeVisible();
  const me = await (await page.request.get('/api/auth/me')).json();
  const joined = await page.request.post('/api/queue', {
    headers: { 'X-Requested-With': 'GPUspace', 'X-CSRF-Token': me.csrfToken }, data: { gpu_id: gpu.id },
  });
  expect(joined.status()).toBe(201);
  expect((await request.put(`/api/reservations/${booking.id}/cancel`, { headers })).status()).toBe(200);
  const blocked = await request.post('/api/reservations', { headers, data: slot });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe('SLOT_HELD');

  await page.goto('/reservations');
  await expect(page.getByText('Held for you', { exact: true })).toBeVisible();
  await expect(page.getByText(/seconds remaining/)).toBeVisible();
  await page.getByRole('link', { name: 'Book Now', exact: true }).click();
  await expect(page.getByLabel('Reservation Date')).toHaveValue(slot.date);
  await expect(page.getByLabel('Start Time')).toHaveValue('10:00');
  await expect(page.getByLabel('End Time')).toHaveValue('11:00');
  await expect(page.getByLabel('Start Time')).toHaveAttribute('readonly', '');
  await page.getByLabel('Research / Project Purpose').fill('Accepting my exclusive queue offer');
  await page.getByRole('button', { name: 'Confirm Reservation' }).click();
  await expect(page.getByText('Reservation created successfully!')).toBeVisible();
  await expect(page.getByText('Booked', { exact: true })).toBeVisible();
  await expect(page.getByText('Accepting my exclusive queue offer')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book Now', exact: true })).toHaveCount(0);
});
