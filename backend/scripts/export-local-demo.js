// One-time, read-only export from the previous JWT-based local demo server.
// Refuses unknown accounts because their password hashes cannot be recovered by API.
const fs = require('node:fs');
const path = require('node:path');
const source = 'http://127.0.0.1:5000/api';
const target = path.join(__dirname, '../../.local/pre-session-migration.json');
async function get(endpoint, token) {
  const response = await fetch(source + endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Export ${endpoint}: HTTP ${response.status}`);
  return response.json();
}
async function login(email) {
  const response = await fetch(source + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) });
  if (!response.ok) throw new Error('Existing demo login failed; refusing migration');
  const data = await response.json();
  if (!data.token) throw new Error('Source is not the previous JWT demo server');
  return data.token;
}
async function main() {
  if (fs.existsSync(target)) throw new Error('Snapshot already exists; refusing to overwrite it');
  const seed = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  const hashes = new Map([...seed.matchAll(/'([^']+@[^']+)',\s*'(\$2[^']+)'/g)].map(m => [m[1], m[2]]));
  const admin = await login('admin@muj.manipal.edu');
  const users = await get('/admin/users', admin);
  if (users.some(u => !hashes.has(u.email))) throw new Error('Non-demo accounts exist; keep source running and use a database-native migration instead');
  const gpus = await get('/gpus', admin);
  const reservations = await get('/reservations/all', admin);
  const queue = [], notifications = [];
  for (const user of users) {
    const token = await login(user.email);
    user.password = hashes.get(user.email);
    queue.push(...(await get('/queue', token)).map(q => ({ ...q, user_id: user.id })));
    notifications.push(...(await get('/notifications', token)).map(n => ({ ...n, user_id: user.id })));
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ users, gpus, reservations, queue, notifications }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ users: users.length, gpus: gpus.length, reservations: reservations.length, queue: queue.length, notifications: notifications.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
