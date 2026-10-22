const pool = require('../config/db');
const { sessionToken, hash, equal, clearSessionCookie } = require('../config/sessions');
const auth = async (req, res, next) => {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.', code: 'SESSION_EXPIRED' });
  try {
    const result = await pool.query(`SELECT s.token_hash, s.csrf_token, s.expires_at, s.last_seen_at, s.idle_ms,
      u.id, u.name, u.email, u.role FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1`, [hash(token)]);
    const session = result.rows[0];
    if (!session || new Date(session.expires_at).getTime() <= Date.now() || new Date(session.last_seen_at).getTime() + session.idle_ms <= Date.now()) {
      if (session) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [session.token_hash]);
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Your session expired. Please sign in again.', code: 'SESSION_EXPIRED' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !equal(req.get('X-CSRF-Token'), session.csrf_token)) {
      return res.status(403).json({ message: 'Your session changed. Reload the page and try again.', code: 'CSRF_INVALID' });
    }
    // Polling must not keep an unattended session alive indefinitely.
    if (req.path !== '/me' && !req.baseUrl.endsWith('/notifications') && Date.now() - new Date(session.last_seen_at).getTime() > 60000) {
      await pool.query('UPDATE auth_sessions SET last_seen_at = $1 WHERE token_hash = $2', [new Date(), session.token_hash]);
    }
    req.user = { id: session.id, name: session.name, email: session.email, role: session.role };
    req.session = session;
    next();
  } catch (err) { next(err); }
};
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied. Admin only.' });
  next();
};
module.exports = { auth, adminOnly };
