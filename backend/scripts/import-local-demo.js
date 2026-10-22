const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
async function main() {
  if (!process.env.LOCAL_MIGRATION_DATABASE_URL) throw new Error('LOCAL_MIGRATION_DATABASE_URL is required');
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.local/pre-session-migration.json'), 'utf8'));
  const pool = new Pool({ connectionString: process.env.LOCAL_MIGRATION_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
    if (Number((await client.query('SELECT COUNT(*) AS count FROM users')).rows[0].count)) throw new Error('Target contains users; refusing import');
    const tables = {
      users: ['id', 'name', 'email', 'password', 'role', 'created_at'],
      gpus: ['id', 'model', 'vram', 'status', 'location', 'created_at'],
      reservations: ['id', 'user_id', 'gpu_id', 'date', 'start_time', 'end_time', 'status', 'purpose', 'created_at'],
      queue: ['id', 'user_id', 'gpu_id', 'position', 'status', 'joined_at'],
      notifications: ['id', 'user_id', 'message', 'type', 'is_read', 'created_at'],
    };
    for (const [table, columns] of Object.entries(tables)) {
      for (const row of snapshot[table]) await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(',')})`, columns.map(c => row[c] ?? null));
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${table}`);
      const count = Number((await client.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count);
      if (count !== snapshot[table].length) throw new Error(`Count mismatch for ${table}`);
    }
    await client.query('COMMIT');
    console.log('Imported and verified all exported users, GPUs, reservations, queue entries, and notifications.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
