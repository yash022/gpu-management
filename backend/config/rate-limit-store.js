const pool = require('./db');
const { createHash } = require('node:crypto');
// Atomic PostgreSQL UPSERT: counters are shared across processes and restarts.
class DatabaseRateLimitStore {
  constructor(prefix) { this.prefix = prefix; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  key(value) { return this.prefix + createHash('sha256').update(value).digest('hex'); }
  async increment(key) {
    const now = new Date();
    const reset = new Date(now.getTime() + this.windowMs);
    const result = await pool.query(`INSERT INTO auth_rate_limits (key, hits, reset_at) VALUES ($1, 1, $2)
      ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN auth_rate_limits.reset_at <= $3 THEN 1 ELSE auth_rate_limits.hits + 1 END,
      reset_at = CASE WHEN auth_rate_limits.reset_at <= $3 THEN $2 ELSE auth_rate_limits.reset_at END
      RETURNING hits, reset_at`, [this.key(key), reset, now]);
    return { totalHits: Number(result.rows[0].hits), resetTime: new Date(result.rows[0].reset_at) };
  }
  async decrement(key) { await pool.query('UPDATE auth_rate_limits SET hits = GREATEST(0, hits - 1) WHERE key = $1', [this.key(key)]); }
  async resetKey(key) { await pool.query('DELETE FROM auth_rate_limits WHERE key = $1', [this.key(key)]); }
}
module.exports = DatabaseRateLimitStore;
