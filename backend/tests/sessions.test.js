const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.SESSION_TEST_DATABASE_URL || '';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
const app = require('../server');
const pool = require('../config/db');
const { hash } = require('../config/sessions');
const Store = require('../config/rate-limit-store');
let server, base, user, first;
const email = `sessions-${Date.now()}@example.com`;
async function req(path, method = 'GET', body, session, headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GPUspace', Origin: 'http://localhost:5173', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0], csrfToken: data.csrfToken, headers: res.headers };
}
const login = (remember = false, previous) => req('/auth/login', 'POST', { email, password: 'session-password-123', remember }, previous);
before(async () => {
  await pool.ready;
  server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const r = await req('/auth/register', 'POST', { name: 'Session Tester', email, password: 'session-password-123' });
  assert.equal(r.status, 201); first = r; user = r.data.user;
});
after(async () => {
  if (user) await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});
test('session lifecycle and distributed authentication', async t => {
  await t.test('opaque HttpOnly cookie, no bearer credential in JSON, hash-only persistence', async () => {
    assert.match(first.headers.get('set-cookie'), /HttpOnly/); assert.match(first.headers.get('set-cookie'), /SameSite=Lax/);
    assert.doesNotMatch(first.headers.get('set-cookie'), /Max-Age/); assert.equal(first.data.token, undefined);
    const raw = first.cookie.split('=')[1];
    const rows = await pool.query('SELECT token_hash FROM auth_sessions WHERE user_id = $1', [user.id]);
    assert.equal(rows.rows[0].token_hash, hash(raw)); assert.notEqual(rows.rows[0].token_hash, raw);
    assert.equal((await req('/auth/me', 'GET', undefined, first)).status, 200);
  });
  await t.test('CSRF rejects missing token, custom header, forged origin, and simple login forms', async () => {
    assert.equal((await req('/notifications/read-all', 'PUT', {}, first, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await req('/auth/logout', 'POST', {}, first, { 'X-Requested-With': '' })).status, 403);
    assert.equal((await req('/auth/logout', 'POST', {}, first, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await req('/auth/login', 'POST', { email, password: 'session-password-123' }, undefined, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await req('/auth/me', 'GET', undefined, first)).status, 200);
  });
  await t.test('remember choice persists cookie and login rotates/revokes previous session', async () => {
    const next = await login(true, first); assert.equal(next.status, 200);
    assert.match(next.headers.get('set-cookie'), /Max-Age=2592000/); assert.notEqual(next.cookie, first.cookie);
    assert.equal((await req('/auth/me', 'GET', undefined, first)).status, 401);
    first = next;
  });
  await t.test('logout revokes replayed cookies and is idempotent', async () => {
    assert.equal((await req('/auth/logout', 'POST', {}, first)).status, 200);
    assert.equal((await req('/auth/me', 'GET', undefined, first)).status, 401);
    assert.equal((await req('/auth/logout', 'POST', {}, first)).status, 200);
  });
  await t.test('logout all devices revokes independent sessions', async () => {
    const a = await login(), b = await login();
    assert.equal((await req('/auth/logout-all', 'POST', {}, a)).status, 200);
    assert.equal((await req('/auth/me', 'GET', undefined, a)).status, 401);
    assert.equal((await req('/auth/me', 'GET', undefined, b)).status, 401);
  });
  await t.test('absolute and idle expiry are enforced on the server', async () => {
    const a = await login();
    await pool.query('UPDATE auth_sessions SET expires_at = $1 WHERE user_id = $2', [new Date(0), user.id]);
    assert.equal((await req('/auth/me', 'GET', undefined, a)).status, 401);
    const b = await login();
    await pool.query('UPDATE auth_sessions SET last_seen_at = $1 WHERE user_id = $2', [new Date(0), user.id]);
    assert.equal((await req('/auth/me', 'GET', undefined, b)).status, 401);
  });
  await t.test('forged session and old JWT headers cannot authenticate', async () => {
    assert.equal((await req('/auth/me', 'GET', undefined, { cookie: 'gpuspace_session=' + 'a'.repeat(64), csrfToken: '' })).status, 401);
    assert.equal((await req('/auth/me', 'GET', undefined, undefined, { Authorization: 'Bearer old-token' })).status, 401);
  });
  await t.test('separate server instance validates and revokes the same session', async () => {
    const session = await login();
    const other = app.listen(0); await new Promise(resolve => other.once('listening', resolve));
    try {
      const me = await fetch(`http://127.0.0.1:${other.address().port}/api/auth/me`, { headers: { Cookie: session.cookie } }); assert.equal(me.status, 200);
      await req('/auth/logout', 'POST', {}, session);
      const replay = await fetch(`http://127.0.0.1:${other.address().port}/api/auth/me`, { headers: { Cookie: session.cookie } }); assert.equal(replay.status, 401);
    } finally { await new Promise(resolve => other.close(resolve)); }
  });
  await t.test('independent limiter stores share atomic counters and reset expired windows', async () => {
    const a = new Store('test-shared:'), b = new Store('test-shared:'); a.init({ windowMs: 60000 }); b.init({ windowMs: 60000 });
    const key = `client-${Date.now()}`;
    const counts = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).increment(key)));
    assert.deepEqual(counts.map(r => r.totalHits).sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1));
    await pool.query('UPDATE auth_rate_limits SET reset_at = $1 WHERE key = $2', [new Date(0), a.key(key)]);
    assert.equal((await b.increment(key)).totalHits, 1); await a.resetKey(key);
  });
  await t.test('database outage is not misreported as invalid credentials', async () => {
    const session = await login();
    const query = pool.query;
    pool.query = async () => { throw new Error('simulated database outage'); };
    try { assert.equal((await req('/auth/me', 'GET', undefined, session)).status, 500); }
    finally { pool.query = query; }
    assert.equal((await req('/auth/me', 'GET', undefined, session)).status, 200);
  });
  await t.test('authenticated reads handle a concurrent user burst', async t => {
    const session = await login();
    const elapsed = [];
    for (let batch = 0; batch < 10; batch++) {
      await Promise.all(Array.from({ length: 10 }, async () => {
        const start = performance.now();
        assert.equal((await req('/auth/me', 'GET', undefined, session)).status, 200);
        elapsed.push(performance.now() - start);
      }));
    }
    elapsed.sort((a, b) => a - b);
    t.diagnostic(`100 authenticated requests, concurrency 10; p95 ${elapsed[94].toFixed(1)} ms. Local smoke measurement, not a capacity guarantee.`);
  });
});
