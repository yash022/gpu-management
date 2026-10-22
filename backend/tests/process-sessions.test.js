const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const connectionString = process.env.SESSION_TEST_DATABASE_URL;
async function start() {
  const child = spawn(process.execPath, ['-e', `const pool = require('./config/db'); pool.ready.then(() => { const server = require('./server').listen(0, '127.0.0.1', () => console.log('TEST_PORT=' + server.address().port)); });`], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: connectionString, FRONTEND_ORIGIN: 'https://gpu.example.com' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Process startup timed out: ' + output)); }, 15000);
    child.stdout.on('data', data => { output += data; const match = output.match(/TEST_PORT=(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}/api`); } });
    child.stderr.on('data', data => { output += data; });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Process exited ${code}: ${output}`)); });
  });
  return { child, base };
}
async function stop(child) { if (child.exitCode !== null || child.signalCode !== null) return; await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
test('production cookie flags and cross-process revocation survive a process restart', { skip: !connectionString }, async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString });
  const processes = [];
  let id;
  try {
    await pool.query(require('node:fs').readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
    // Separate processes use the same already-migrated PostgreSQL database.
    const a = await start(), b = await start(); processes.push(a.child, b.child);
    const registered = await fetch(a.base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GPUspace', Origin: 'https://gpu.example.com' }, body: JSON.stringify({ name: 'Multi-process test', email: `process-${Date.now()}@example.com`, password: 'process-password-123' }) });
    assert.equal(registered.status, 201); id = (await registered.json()).user.id;
    const header = registered.headers.get('set-cookie');
    assert.match(header, /^__Host-gpuspace=/); assert.match(header, /Secure/); assert.match(header, /HttpOnly/); assert.match(header, /Path=\//); assert.doesNotMatch(header, /Domain=/);
    const cookie = header.split(';')[0];
    assert.equal((await fetch(b.base + '/auth/me', { headers: { Cookie: cookie } })).status, 200);
    await stop(a.child);
    const c = await start(); processes.push(c.child);
    assert.equal((await fetch(c.base + '/auth/me', { headers: { Cookie: cookie } })).status, 200);
    const logout = await fetch(c.base + '/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'GPUspace', Origin: 'https://gpu.example.com' } });
    assert.equal(logout.status, 200);
    assert.equal((await fetch(b.base + '/auth/me', { headers: { Cookie: cookie } })).status, 401);
  } finally {
    await Promise.all(processes.map(stop));
    if (id) await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await pool.end();
  }
});
