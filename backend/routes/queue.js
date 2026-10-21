const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

// GET /api/queue - Get current user's waiting list entries
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.id, q.gpu_id, q.position, q.status, q.joined_at,
              g.model AS gpu_model, g.vram AS gpu_vram, g.location AS gpu_location
       FROM queue q
       JOIN gpus g ON q.gpu_id = g.id
       WHERE q.user_id = $1
       ORDER BY q.joined_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get queue error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/queue/gpu/:gpuId - Get queue count for a specific GPU
router.get('/gpu/:gpuId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS waiting_count
       FROM queue
       WHERE gpu_id = $1 AND status = 'waiting'`,
      [req.params.gpuId]
    );
    res.json({ waiting_count: parseInt(result.rows[0].waiting_count || 0) });
  } catch (err) {
    console.error('Get GPU queue count error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/queue - Join waitlist for a GPU
router.post('/', auth, async (req, res) => {
  try {
    const { gpu_id } = req.body;
    if (!gpu_id) {
      return res.status(400).json({ message: 'gpu_id is required' });
    }

    // Check if user is already in waiting queue for this GPU
    const existing = await pool.query(
      `SELECT id FROM queue WHERE user_id = $1 AND gpu_id = $2 AND status = 'waiting'`,
      [req.user.id, gpu_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'You are already in the queue for this GPU' });
    }

    // Determine next position
    const maxPosRes = await pool.query(
      `SELECT COALESCE(MAX(position), 0) AS max_pos FROM queue WHERE gpu_id = $1 AND status = 'waiting'`,
      [gpu_id]
    );
    const nextPos = parseInt(maxPosRes.rows[0].max_pos) + 1;

    const insertRes = await pool.query(
      `INSERT INTO queue (user_id, gpu_id, position, status)
       VALUES ($1, $2, $3, 'waiting')
       RETURNING id, user_id, gpu_id, position, status, joined_at`,
      [req.user.id, gpu_id, nextPos]
    );

    // Fetch GPU info for notification
    const gpuRes = await pool.query('SELECT model FROM gpus WHERE id = $1', [gpu_id]);
    const gpuModel = gpuRes.rows[0]?.model || 'GPU';

    await pool.query(
      `INSERT INTO notifications (user_id, message, type)
       VALUES ($1, $2, 'queue_update')`,
      [
        req.user.id,
        `You joined the waitlist for ${gpuModel} at position #${nextPos}.`
      ]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Join queue error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/queue/:id - Leave queue
router.delete('/:id', auth, async (req, res) => {
  try {
    const queueItem = await pool.query(
      'SELECT id, user_id, gpu_id, position FROM queue WHERE id = $1',
      [req.params.id]
    );

    if (queueItem.rows.length === 0) {
      return res.status(404).json({ message: 'Queue entry not found' });
    }

    if (queueItem.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to remove this queue entry' });
    }

    await pool.query('DELETE FROM queue WHERE id = $1', [req.params.id]);

    res.json({ message: 'Left the queue successfully' });
  } catch (err) {
    console.error('Leave queue error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
