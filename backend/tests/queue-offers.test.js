const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('dotenv').config();
process.env.NODE_ENV = 'test';
if (process.env.QUEUE_TEST_USE_NEON !== '1') process.env.DATABASE_URL = '';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
const pool = require('../config/db');
const app = require('../server');
let server, base;
const users = [], gpus = [];
const slot = { date: '2099-09-20', start_time: '10:00', end_time: '11:00', purpose: 'Queue hold verification' };
async function request(path, method = 'GET', body, user = users[0]) {
  const response = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json', 'X-Requested-With': 'GPUspace', Origin: 'http://localhost:5173',
    ...(user ? { Cookie: user.cookie, 'X-CSRF-Token': user.csrfToken } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
before(async () => {
  await pool.ready;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (let i = 0; i < 4; i++) {
    const created = await request('/auth/register', 'POST', { name: 'Temporary queue test', email: `queue-test-${randomUUID()}@example.invalid`, password: randomUUID() }, null);
    assert.equal(created.status, 201);
    users.push({ ...created.data, cookie: created.cookie });
  }
});
after(async () => {
  for (const id of gpus) await pool.query('DELETE FROM gpus WHERE id = $1', [id]);
  for (const user of users) await pool.query('DELETE FROM users WHERE id = $1', [user.user.id]);
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});
async function setup() {
  const gpu = (await pool.query("INSERT INTO gpus (model,vram,status,location) VALUES ('Temporary queue test','16 GB','available','Test only') RETURNING id")).rows[0];
  gpus.push(gpu.id);
  const booking = await request('/reservations', 'POST', { ...slot, gpu_id: gpu.id });
  assert.equal(booking.status, 201);
  const b = await request('/queue', 'POST', { gpu_id: gpu.id }, users[1]);
  const c = await request('/queue', 'POST', { gpu_id: gpu.id }, users[2]);
  assert.equal(b.status, 201); assert.equal(c.status, 201);
  return { gpu: gpu.id, booking: booking.data.id, b: b.data.id, c: c.data.id };
}
test('cancelled slot is held exclusively, exact owner claim succeeds once, unrelated slots stay open', async () => {
  const x = await setup();
  assert.equal((await request(`/reservations/${x.booking}/cancel`, 'PUT', {})).status, 200);
  const offer = (await request('/queue', 'GET', undefined, users[1])).data.find(q => q.id === x.b);
  assert.equal(offer.status, 'notified');
  assert.ok(new Date(offer.offer_expires_at).getTime() > Date.now());
  assert.ok(new Date(offer.offer_expires_at).getTime() <= Date.now() + 300000);
  const blocked = await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu }, users[3]);
  assert.equal(blocked.status, 409); assert.equal(blocked.data.code, 'SLOT_HELD');
  assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu, end_time: '10:30' }, users[1])).data.code, 'OFFER_SLOT_MISMATCH');
  assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu, start_time: '11:00', end_time: '12:00' }, users[3])).status, 201);
  const claims = await Promise.all(Array.from({ length: 3 }, () => request('/reservations', 'POST', { ...slot, gpu_id: x.gpu, queue_offer_id: x.b }, users[1])));
  assert.equal(claims.filter(r => r.status === 201).length, 1);
  assert.equal(claims.filter(r => r.status === 409).length, 2);
  const claimed = (await pool.query('SELECT * FROM queue WHERE id=$1', [x.b])).rows[0];
  assert.ok(claimed.reservation_id); assert.equal(claimed.status, 'expired');
});
test('expiry advances FIFO before an outsider can book; stale claims cannot steal the new hold', async () => {
  const x = await setup();
  await request(`/reservations/${x.booking}/cancel`, 'PUT', {});
  await pool.query('UPDATE queue SET offer_expires_at=$1 WHERE id=$2', [new Date(0), x.b]);
  const attempt = await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu }, users[3]);
  assert.equal(attempt.data.code, 'SLOT_HELD');
  const next = (await pool.query('SELECT * FROM queue WHERE id=$1', [x.c])).rows[0];
  assert.equal(next.status, 'notified');
  assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu, queue_offer_id: x.b }, users[1])).status, 409);
  assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu, queue_offer_id: x.c }, users[2])).status, 201);
});
test('declining advances next user, unauthorized removal fails, positions are compacted', async () => {
  const x = await setup();
  const d = await request('/queue', 'POST', { gpu_id: x.gpu }, users[3]);
  await request(`/reservations/${x.booking}/cancel`, 'PUT', {});
  assert.equal((await request(`/queue/${x.b}`, 'DELETE', undefined, users[2])).status, 403);
  assert.equal((await request(`/queue/${x.b}`, 'DELETE', undefined, users[1])).status, 200);
  assert.equal((await pool.query('SELECT status FROM queue WHERE id=$1', [x.c])).rows[0].status, 'notified');
  assert.equal((await pool.query('SELECT position FROM queue WHERE id=$1', [d.data.id])).rows[0].position, 1);
  // Duplicate cancellation must not create a second offer.
  assert.equal((await request(`/reservations/${x.booking}/cancel`, 'PUT', {})).status, 409);
  assert.equal((await pool.query("SELECT id FROM queue WHERE gpu_id=$1 AND status='notified'", [x.gpu])).rows.length, 1);
});
test('expiry without another waiter releases the slot', async () => {
  const x = await setup();
  await request(`/queue/${x.c}`, 'DELETE', undefined, users[2]);
  await request(`/reservations/${x.booking}/cancel`, 'PUT', {});
  await pool.query('UPDATE queue SET offer_expires_at=$1 WHERE id=$2', [new Date(0), x.b]);
  await request('/queue', 'GET', undefined, users[1]);
  assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu, queue_offer_id: x.b }, users[1])).data.code, 'OFFER_EXPIRED');
  assert.equal((await request('/reservations', 'POST', { ...slot, gpu_id: x.gpu }, users[3])).status, 201);
});
