const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const pool = require('./db');
const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Host-gpuspace' : 'gpuspace_session';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax', path: '/' };
const hash = value => createHash('sha256').update(value).digest('hex');
const sessionToken = req => {
  const token = req.cookies?.[cookieName];
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null;
};
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
async function createSession(req, res, user, remember = false) {
  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const now = new Date();
  const lifetime = remember ? 30 * 86400000 : 8 * 3600000;
  const expiresAt = new Date(now.getTime() + lifetime);
  const idleMs = remember ? 7 * 86400000 : 30 * 60000;
  await pool.query('INSERT INTO auth_sessions (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at, idle_ms) VALUES ($1,$2,$3,$4,$4,$5,$6)', [hash(token), user.id, csrfToken, now, expiresAt, idleMs]);
  const previous = sessionToken(req);
  if (previous) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hash(previous)]);
  res.cookie(cookieName, token, { ...cookieOptions, ...(remember ? { maxAge: lifetime } : {}) });
  return { user, csrfToken, expiresAt };
}
function clearSessionCookie(res) { res.clearCookie(cookieName, cookieOptions); }
module.exports = { cookieName, hash, sessionToken, equal, createSession, clearSessionCookie };
