const { Pool } = require('pg');
const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let activePool = null;
let memory = false;
let poolReady;
let retryAt = 0;
function ensureReady() {
  // Share one initialization attempt across concurrent requests. A failed cold
  // start must not poison a warm serverless instance for its entire lifetime.
  if (!poolReady || (retryAt && Date.now() >= retryAt)) {
    retryAt = 0;
    poolReady = initDatabase().catch(error => {
      retryAt = Date.now() + 1000;
      error.code = 'DB_INITIALIZATION_FAILED';
      throw error;
    });
    // Observe eager startup failures even before a request awaits readiness.
    poolReady.catch(error => console.error('Database initialization failed:', error.message));
  }
  return poolReady;
}
ensureReady();

async function initDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    const max = Number(process.env.DB_POOL_MAX || 10);
    if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error('DB_POOL_MAX must be between 1 and 100');
    const realPool = new Pool({ connectionString, max, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
    try {

      // Probe connection
      const client = await realPool.connect();

      // Ensure tables exist
      const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
      try {
        if (process.env.NODE_ENV !== 'production') await client.query(schemaSql);
        else {
          await client.query('SELECT token_hash FROM auth_sessions LIMIT 0');
          await client.query('SELECT offer_date, offer_start, offer_end, offer_expires_at, reservation_id FROM queue LIMIT 0');
        }
      } finally { client.release(); }

      realPool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
      });

      activePool = realPool;
      console.log('PostgreSQL database and session schema are ready.');
      return activePool;
    } catch (err) {
      await realPool.end();
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw err;
      console.warn('PostgreSQL connection failed (' + err.message + '). Falling back to built-in in-memory database.');
    }
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('Production requires a working DATABASE_URL');
  }
  memory = true;
  // Fallback: pg-mem
  const memDb = newDb();
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');

  memDb.public.none(schemaSql);
  memDb.public.none(seedSql);

  const pgAdapter = memDb.adapters.createPg();
  activePool = new pgAdapter.Pool();
  console.log('Initialized in-memory database with pre-seeded data.');
  return activePool;
}

const pool = {
  get ready() { return ensureReady(); },
  get isMemory() { return memory; },
  async end() {
    try { await poolReady; } catch { return; }
    return activePool.end();
  },
  async query(text, params) {
    await ensureReady();
    return activePool.query(text, params);
  },
  async connect() {
    await ensureReady();
    return activePool.connect();
  },
  on(event, handler) {
    ensureReady().then(() => {
      if (activePool && typeof activePool.on === 'function') {
        activePool.on(event, handler);
      }
    }).catch(() => { /* Initialization failure is already logged above. */ });
  }
};

module.exports = pool;
