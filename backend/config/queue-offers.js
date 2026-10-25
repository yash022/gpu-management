const pool = require('./db');
const HOLD_MS = 5 * 60 * 1000;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const dateKey = value => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : String(value).slice(0, 10);
const timeKey = value => String(value).slice(0, 5);
const slotStart = slot => new Date(`${dateKey(slot.date)}T${timeKey(slot.start_time)}:00+05:30`).getTime();
const slotFromOffer = row => ({ date: dateKey(row.offer_date), start_time: timeKey(row.offer_start), end_time: timeKey(row.offer_end) });

// Every booking, cancellation and queue mutation uses this same GPU row lock.
// PostgreSQL therefore enforces priority across independent Vercel instances.
async function withGpuLock(gpuId, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT id, model, status FROM gpus WHERE id = $1' + (pool.isMemory ? '' : ' FOR UPDATE'), [gpuId]);
    if (!result.rows.length) throw fail(404, 'GPU not found');
    const value = await work(client, result.rows[0]);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function renumber(client, gpuId) {
  const waiting = await client.query("SELECT id FROM queue WHERE gpu_id = $1 AND status = 'waiting' ORDER BY position, id", [gpuId]);
  for (let i = 0; i < waiting.rows.length; i++) {
    await client.query('UPDATE queue SET position = $1 WHERE id = $2', [i + 1, waiting.rows[i].id]);
  }
}

async function offerNext(client, gpu, slot, now = new Date()) {
  const start = slotStart(slot);
  if (gpu.status !== 'available' || start <= now.getTime()) return;
  const params = [gpu.id, dateKey(slot.date), timeKey(slot.start_time), timeKey(slot.end_time)];
  const booked = await client.query("SELECT id FROM reservations WHERE gpu_id = $1 AND date = $2 AND status = 'confirmed' AND start_time < $4 AND end_time > $3", params);
  const held = await client.query("SELECT id FROM queue WHERE gpu_id = $1 AND offer_date = $2 AND status = 'notified' AND offer_start < $4 AND offer_end > $3", params);
  if (booked.rows.length || held.rows.length) return;
  const next = await client.query("SELECT id, user_id FROM queue WHERE gpu_id = $1 AND status = 'waiting' ORDER BY position, id LIMIT 1", [gpu.id]);
  if (!next.rows.length) return;
  const candidate = next.rows[0];
  const expires = new Date(Math.min(now.getTime() + HOLD_MS, start));
  await client.query("UPDATE queue SET status = 'notified', offer_date = $1, offer_start = $2, offer_end = $3, offer_expires_at = $4 WHERE id = $5", [...params.slice(1), expires, candidate.id]);
  await client.query("INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'queue_update')", [candidate.user_id,
    `You are next in line for ${gpu.model}. ${params[1]} ${params[2]}–${params[3]} IST is held exclusively for you until ${expires.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })} IST. Open My reservations & queue to book or decline.`]);
  await renumber(client, gpu.id);
}

async function refreshLocked(client, gpu, now = new Date()) {
  const expired = await client.query("SELECT * FROM queue WHERE gpu_id = $1 AND status = 'notified' AND offer_expires_at <= $2 ORDER BY offer_expires_at, id", [gpu.id, now]);
  for (const entry of expired.rows) {
    await client.query("UPDATE queue SET status = 'expired' WHERE id = $1", [entry.id]);
    await offerNext(client, gpu, slotFromOffer(entry), now);
  }
}

// Request-driven reconciliation works on serverless hosts without an in-process
// timer. Notification/queue polling and booking requests advance expired offers.
async function refreshExpired() {
  const due = await pool.query("SELECT DISTINCT gpu_id FROM queue WHERE status = 'notified' AND offer_expires_at <= $1", [new Date()]);
  for (const row of due.rows) await withGpuLock(row.gpu_id, refreshLocked);
}

module.exports = { withGpuLock, refreshLocked, refreshExpired, offerNext, renumber, fail, dateKey, timeKey, slotFromOffer };
