const { Pool } = require('pg');
const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let activePool = null;
const poolReady = initDatabase();

async function initDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    try {
      const realPool = new Pool({
        connectionString,
        connectionTimeoutMillis: 1500,
      });

      // Probe connection
      const client = await realPool.connect();
      console.log('Successfully connected to PostgreSQL database.');

      // Ensure tables exist
      const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
      await client.query(schemaSql);
      client.release();

      realPool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
      });

      activePool = realPool;
      return activePool;
    } catch (err) {
      console.warn('PostgreSQL connection failed (' + err.message + '). Falling back to built-in in-memory database.');
    }
  }

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
