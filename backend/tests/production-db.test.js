const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('a failed cold start recovers on the same instance without concurrent connection storms', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    let now = 10000, attempts = 0, closed = 0;
    Date.now = () => now;
    class FakePool {
      constructor(options) { attempts++; assert.equal(options.connectionTimeoutMillis, 10000); }
      async connect() {
        if (attempts === 1) throw new Error('Connection terminated due to connection timeout');
        return { query: async () => ({ rows: [] }), release() {} };
      }
      async query() { return { rows: [{ healthy: true }] }; }
      async end() { closed++; }
      on() {}
    }
    require.cache[require.resolve('pg')] = { exports: { Pool: FakePool } };
    const pool = require('./config/db');
    (async () => {
      await assert.rejects(pool.ready, { code: 'DB_INITIALIZATION_FAILED' });
      assert.equal(closed, 1, 'Failed pool must be closed');
      await assert.rejects(pool.query('SELECT 1'));
      assert.equal(attempts, 1, 'Cooldown must prevent repeated attempts');
      now += 1001;
      const results = await Promise.all(Array.from({ length: 20 }, () => pool.query('SELECT 1')));
      assert.ok(results.every(result => result.rows[0].healthy));
      assert.equal(attempts, 2, 'Concurrent requests must share a single retry');
      assert.equal(pool.isMemory, false);
      await pool.ready;
      await pool.query('SELECT 1');
      assert.equal(attempts, 2, 'Healthy pool must be reused');
      await pool.end();
      assert.equal(closed, 2);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production', VERCEL: '1', DATABASE_URL: 'postgresql://test:test@localhost/test' },
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

for (const databaseUrl of ['', 'postgresql://invalid:invalid@127.0.0.1:1/unavailable']) {
  test(`Vercel refuses ephemeral sessions with ${databaseUrl ? 'an unreachable' : 'a missing'} database`, () => {
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const app = require('./server');
      const pool = require('./config/db');
      (async () => {
        await assert.rejects(pool.ready, { code: 'DB_INITIALIZATION_FAILED' });
        assert.equal(pool.isMemory, false);
        const server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        try {
          const base = 'http://127.0.0.1:' + server.address().port;
          const response = await fetch(base + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GPUspace', Origin: 'https://gpu.example.com' },
            body: JSON.stringify({ email: 'admin@muj.manipal.edu', password: 'admin123' })
          });
          assert.equal(response.status, 503);
          assert.equal((await response.json()).code, 'DATABASE_UNAVAILABLE');
          assert.equal(response.headers.get('set-cookie'), null);
          assert.equal((await fetch(base + '/api/ready')).status, 503);
        } finally {
          await new Promise(resolve => server.close(resolve));
        }
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production', VERCEL: '1', DATABASE_URL: databaseUrl,
        ALLOW_IN_MEMORY_DB: '1', FRONTEND_ORIGIN: 'https://gpu.example.com' },
      encoding: 'utf8', timeout: 15000, windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.doesNotMatch(result.stdout, /Initialized in-memory database/);
  });
}
