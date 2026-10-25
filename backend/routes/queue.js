const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const serialize = require('../middleware/serialize');
const { withGpuLock, refreshLocked, refreshExpired, offerNext, renumber, fail, slotFromOffer, dateKey } = require('../config/queue-offers');
router.param('id', require('../middleware/validation').resourceId);
router.param('gpuId', require('../middleware/validation').resourceId);
const respondError = (res, error) => {
  if (!error.status) console.error('Queue error:', error.message);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to update the waitlist. Please retry.' });
};

router.get('/', auth, serialize, async (req, res) => {
  try {
    await refreshExpired();
    const result = await pool.query(`SELECT q.*, g.model AS gpu_model, g.vram AS gpu_vram, g.location AS gpu_location
      FROM queue q JOIN gpus g ON q.gpu_id = g.id WHERE q.user_id = $1 ORDER BY q.joined_at DESC`, [req.user.id]);
    res.json(result.rows.map(row => ({ ...row, offer_date: row.offer_date ? dateKey(row.offer_date) : null })));
  } catch (error) { respondError(res, error); }
});

router.get('/gpu/:gpuId', async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) AS waiting_count FROM queue WHERE gpu_id = $1 AND status = 'waiting'", [req.params.gpuId]);
    res.json({ waiting_count: Number(result.rows[0].waiting_count) });
  } catch (error) { respondError(res, error); }
});

router.post('/', auth, serialize, async (req, res) => {
  const { gpu_id } = req.body;
  if (!require('../middleware/validation').id(gpu_id)) return res.status(400).json({ message: 'gpu_id is required' });
  try {
    const entry = await withGpuLock(gpu_id, async (client, gpu) => {
      await refreshLocked(client, gpu);
      if (gpu.status !== 'available') throw fail(400, 'This GPU is unavailable');
      const existing = await client.query("SELECT id FROM queue WHERE user_id = $1 AND gpu_id = $2 AND status IN ('waiting', 'notified')", [req.user.id, gpu_id]);
      if (existing.rows.length) throw fail(400, 'You are already waiting or have an active offer for this GPU');
      await renumber(client, gpu_id);
      const count = await client.query("SELECT COUNT(*) AS count FROM queue WHERE gpu_id = $1 AND status = 'waiting'", [gpu_id]);
      const position = Number(count.rows[0].count) + 1;
      const result = await client.query("INSERT INTO queue (user_id, gpu_id, position, status) VALUES ($1, $2, $3, 'waiting') RETURNING *", [req.user.id, gpu_id, position]);
      await client.query("INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'queue_update')", [req.user.id, `You joined the waitlist for ${gpu.model} at position #${position}. If a future booking is cancelled, the next user gets an exclusive offer for up to 5 minutes.`]);
      return result.rows[0];
    });
    res.status(201).json(entry);
  } catch (error) { respondError(res, error); }
});

router.delete('/:id', auth, serialize, async (req, res) => {
  try {
    const found = await pool.query('SELECT gpu_id FROM queue WHERE id = $1', [req.params.id]);
    if (!found.rows.length) throw fail(404, 'Queue entry not found');
    await withGpuLock(found.rows[0].gpu_id, async (client, gpu) => {
      await refreshLocked(client, gpu);
      const result = await client.query('SELECT * FROM queue WHERE id = $1', [req.params.id]);
      const entry = result.rows[0];
      if (!entry) throw fail(404, 'Queue entry not found');
      if (entry.user_id !== req.user.id && req.user.role !== 'admin') throw fail(403, 'Not authorized to remove this queue entry');
      await client.query('DELETE FROM queue WHERE id = $1', [entry.id]);
      if (entry.status === 'notified') await offerNext(client, gpu, slotFromOffer(entry));
      await renumber(client, gpu.id);
    });
    res.json({ message: 'Left the queue. Any held slot has been offered to the next waiting user.' });
  } catch (error) { respondError(res, error); }
});
module.exports = router;
