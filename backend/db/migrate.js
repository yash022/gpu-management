require('dotenv').config();
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const path = require('node:path');
async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migrations');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Prevent concurrent deployment jobs from applying DDL simultaneously.
    await client.query('SELECT pg_advisory_xact_lock(634201)');
    await client.query(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('Database schema is up to date.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
migrate().catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; });
