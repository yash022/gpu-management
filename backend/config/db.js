const { Pool } = require('pg');
const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let activePool = null;
let memory = false;
const poolReady = initDatabase().catch(error => {
  error.code = 'DB_INITIALIZATION_FAILED';
  throw error;
});
// Serverless imports can finish before the first request awaits the database.
// Observe failures here without turning the rejected readiness promise into success.
poolReady.catch(error => console.error('Database initialization failed:', error.message));

async function initDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    const max = Number(process.env.DB_POOL_MAX || 10);
    if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error('DB_POOL_MAX must be between 1 and 100');
    const realPool = new Pool({ connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
    try {

      // Probe connection
      const client = await realPool.connect();
      console.log('Successfully connected to PostgreSQL database.');

      // Ensure tables exist
      const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
      try {
        if (process.env.NODE_ENV !== 'production') await client.query(schemaSql);
        else await client.query('SELECT token_hash FROM auth_sessions LIMIT 0');
      } finally { client.release(); }

      realPool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
      });

      activePool = realPool;
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
  ready: poolReady,
  get isMemory() { return memory; },
  async end() { await poolReady; return activePool.end(); },
  async query(text, params) {
    await poolReady;
    return activePool.query(text, params);
  },
  async connect() {
    await poolReady;
    return activePool.connect();
  },
  on(event, handler) {
    poolReady.then(() => {
      if (activePool && typeof activePool.on === 'function') {
        activePool.on(event, handler);
      }
    });
  }
};

module.exports = pool;
