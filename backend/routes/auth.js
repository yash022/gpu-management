const { text } = require('../middleware/validation');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { createSession, clearSessionCookie, sessionToken, hash } = require('../config/sessions');
const { rateLimit } = require('express-rate-limit');
const DatabaseRateLimitStore = require('../config/rate-limit-store');
const ipLimiter = rateLimit({ windowMs: 15 * 60000, limit: 60, store: new DatabaseRateLimitStore('auth-ip:'), standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.', code: 'RATE_LIMITED' } });
const accountLimiter = rateLimit({ windowMs: 15 * 60000, limit: 10, store: new DatabaseRateLimitStore('auth-account:'), keyGenerator: req => String(req.body.email || '').trim().toLowerCase(), standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many attempts for this account. Please try again in 15 minutes.', code: 'RATE_LIMITED' } });
const dummyHash = bcrypt.hashSync('constant-work-dummy-password', 10);
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
router.post('/register', ipLimiter, accountLimiter, async (req, res, next) => {
  try {
    const { name, password, role = 'student' } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!text(name, 100) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150 || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72 || !['student', 'faculty', 'researcher'].includes(role)) return res.status(400).json({ message: 'Enter a name, valid email, password of 8 characters to 72 UTF-8 bytes, and a valid role.' });
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(400).json({ message: 'An account with this email already exists. Please sign in.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query('INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role', [name.trim(), email, hashedPassword, role]);
    res.status(201).json(await createSession(req, res, result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    next(err);
  }
});
router.post('/login', ipLimiter, accountLimiter, async (req, res, next) => {
  try {
    const { password, remember = false } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 150 || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72 || typeof remember !== 'boolean') return res.status(400).json({ message: 'Invalid credentials. Check your email and password.' });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user?.password || dummyHash);
    if (!user || !valid) return res.status(400).json({ message: 'Invalid credentials. Check your email and password.' });
    res.json(await createSession(req, res, publicUser(user), remember));
  } catch (err) { next(err); }
});
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user, csrfToken: req.session.csrf_token, expiresAt: req.session.expires_at });
});
router.post('/logout', async (req, res, next) => {
  // Origin/custom-header protection still applies; idempotent for expired sessions.
  try {
    const token = sessionToken(req);
    if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hash(token)]);
    clearSessionCookie(res);
    res.json({ message: 'You have been signed out.' });
  } catch (err) { next(err); }
});
router.post('/logout-all', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [req.user.id]);
    clearSessionCookie(res);
    res.json({ message: 'You have been signed out on all devices.' });
  } catch (err) { next(err); }
});
module.exports = router;
