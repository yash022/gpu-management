const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.API_TEST_DATABASE_URL || '';

const app = require('../server');
const pool = require('../config/db');
const csrf = new Map();
let server, base, alice, bob, admin, gpu, booking;
async function request(path, method = 'GET', body, token) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GPUspace', ...(token ? { Cookie: token, 'X-CSRF-Token': csrf.get(token) || '' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (data.csrfToken && res.headers.get('set-cookie')) { data.token = res.headers.get('set-cookie').split(';')[0]; csrf.set(data.token, data.csrfToken); }
  return { status: res.status, data, headers: res.headers };
}
const slot = { date: '2099-06-10', start_time: '10:00', end_time: '11:00', purpose: 'Integration test' };
before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
test('API integration and security regressions', async t => {
  await t.test('health and security headers', async () => {
    const r = await request('/health'); assert.equal(r.status, 200); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('x-powered-by'), null);
  });
  await t.test('reject public administrator registration and malformed input', async () => {
    for (const body of [{}, { name: 'Admin', email: 'bad@example.com', password: 'password123', role: 'admin' }, { name: 'A', email: 'invalid', password: 'password123' }]) assert.equal((await request('/auth/register', 'POST', body)).status, 400);
  });
  await t.test('register, normalize email, login, reject duplicate and bad password', async () => {
    const a = await request('/auth/register', 'POST', { name: 'Alice', email: ' ALICE@example.com ', password: 'password123' }); assert.equal(a.status, 201); alice = a.data;
    assert.equal(alice.user.email, 'alice@example.com');
    bob = (await request('/auth/register', 'POST', { name: 'Bob', email: 'bob@example.com', password: 'password123' })).data;
    assert.equal((await request('/auth/login', 'POST', { email: 'ALICE@example.com', password: 'password123' })).status, 200);
    assert.equal((await request('/auth/login', 'POST', { email: 'alice@example.com', password: 'wrong' })).status, 400);
    assert.equal((await request('/auth/register', 'POST', { name: 'Alice', email: 'alice@example.com', password: 'password123' })).status, 400);
  });
  await t.test('protect private routes and use current roles', async () => {
    assert.equal((await request('/reservations')).status, 401);
    assert.equal((await request('/admin/users', 'GET', undefined, alice.token)).status, 403);
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [bob.user.id]); admin = bob.token;
    assert.equal((await request('/admin/users', 'GET', undefined, admin)).status, 200);
  });
  await t.test('GPU CRUD input validation', async () => {
    assert.equal((await request('/gpus', 'POST', {}, admin)).status, 400);
    const r = await request('/gpus', 'POST', { model: 'Test accelerator', vram: '80 GB', location: 'Test lab', status: 'available' }, admin); assert.equal(r.status, 201); gpu = r.data;
    assert.equal((await request('/gpus/invalid')).status, 400);
  });
  await t.test('reject invalid, reversed, past, nonexistent, and unavailable bookings', async () => {
    for (const change of [{ date: '2099-02-30' }, { end_time: '09:00' }, { date: '2000-01-01' }, { start_time: '25:00' }, { purpose: '' }]) assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: gpu.id, ...change }, alice.token)).status, 400);
    assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: 999999 }, alice.token)).status, 404);
    await pool.query("UPDATE gpus SET status = 'maintenance' WHERE id = $1", [gpu.id]);
    assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: gpu.id }, alice.token)).status, 400);
    await pool.query("UPDATE gpus SET status = 'available' WHERE id = $1", [gpu.id]);
  });
  await t.test('concurrent overlapping reservations produce one winner', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => request('/reservations', 'POST', { ...slot, gpu_id: gpu.id }, alice.token)));
    assert.equal(results.filter(r => r.status === 201).length, 1); assert.equal(results.filter(r => r.status === 409).length, 7); booking = results.find(r => r.status === 201).data;
    assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: gpu.id, start_time: '11:00', end_time: '12:00' }, alice.token)).status, 201);
  });
  await t.test('queue, ownership, cancellation, and notification lifecycle', async () => {
    await pool.query("UPDATE users SET role = 'student' WHERE id = $1", [bob.user.id]);
    assert.equal((await request('/admin/users', 'GET', undefined, admin)).status, 403);
    assert.equal((await request(`/reservations/${booking.id}/cancel`, 'PUT', {}, bob.token)).status, 403);
    const queued = await request('/queue', 'POST', { gpu_id: gpu.id }, bob.token); assert.equal(queued.status, 201);
    assert.equal((await request('/queue', 'POST', { gpu_id: gpu.id }, bob.token)).status, 400);
    assert.equal((await request(`/queue/${queued.data.id}`, 'DELETE', undefined, alice.token)).status, 403);
    assert.equal((await request(`/reservations/${booking.id}/cancel`, 'PUT', {}, alice.token)).status, 200);
    assert.equal((await request(`/reservations/${booking.id}/cancel`, 'PUT', {}, alice.token)).status, 409);
    const notices = await request('/notifications', 'GET', undefined, bob.token); assert.ok(notices.data.some(n => n.message.includes('next in line')));
    assert.equal((await request(`/notifications/${notices.data[0].id}/read`, 'PUT', {}, alice.token)).status, 404);
    assert.equal((await request('/notifications/read-all', 'PUT', {}, bob.token)).status, 200);
    assert.ok((await request('/notifications', 'GET', undefined, bob.token)).data.every(n => n.is_read));
    await pool.query('DELETE FROM users WHERE id = $1', [bob.user.id]); assert.equal((await request('/auth/me', 'GET', undefined, bob.token)).status, 401);
  });
  await t.test('malformed JSON and body size limits return client errors', async () => {
    const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }); assert.equal(r.status, 400);
    assert.equal((await request('/auth/login', 'POST', { password: 'x'.repeat(20000) })).status, 413);
  });
  await t.test('authentication throttling', async () => {
    let r; for (let i = 0; i < 65; i++) r = await request('/auth/login', 'POST', {});
    assert.equal(r.status, 429);
  });
});
