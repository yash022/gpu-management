const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/reservations - Current user's reservations with GPU info
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.user_id, r.gpu_id, g.model AS gpu_model, g.vram AS gpu_vram,
              r.date, r.start_time, r.end_time, r.status, r.purpose, r.created_at
       FROM reservations r
       JOIN gpus g ON r.gpu_id = g.id
       WHERE r.user_id = $1
       ORDER BY r.date DESC, r.start_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get reservations error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/reservations/all - Admin only. All reservations with user & GPU info
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.user_id, u.name AS user_name, u.email AS user_email,
              r.gpu_id, g.model AS gpu_model,
              r.date, r.start_time, r.end_time, r.status, r.purpose, r.created_at
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       JOIN gpus g ON r.gpu_id = g.id
       ORDER BY r.date DESC, r.start_time DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get all reservations error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/reservations - Create reservation with conflict check
router.post('/', auth, async (req, res) => {
  try {
    const { gpu_id, date, start_time, end_time, purpose } = req.body;

    // Check for time conflicts: overlapping confirmed reservations on the same GPU and date
    const conflictCheck = await pool.query(
      `SELECT id FROM reservations
       WHERE gpu_id = $1
         AND date = $2
         AND status = 'confirmed'
         AND start_time < $4
         AND end_time > $3`,
      [gpu_id, date, start_time, end_time]
    );

    if (conflictCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Time slot conflicts with an existing reservation' });
    }

    // Create the reservation
    const result = await pool.query(
      `INSERT INTO reservations (user_id, gpu_id, date, start_time, end_time, purpose)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, gpu_id, date, start_time, end_time, status, purpose, created_at`,
      [req.user.id, gpu_id, date, start_time, end_time, purpose]
    );

    const reservation = result.rows[0];

    // Get GPU model for the notification message
    const gpuResult = await pool.query('SELECT model FROM gpus WHERE id = $1', [gpu_id]);
    const gpuModel = gpuResult.rows.length > 0 ? gpuResult.rows[0].model : 'Unknown GPU';

    // Create a notification for the user
    await pool.query(
      `INSERT INTO notifications (user_id, message, type)
       VALUES ($1, $2, $3)`,
      [
        req.user.id,
        `Your reservation for ${gpuModel} on ${date} from ${start_time} to ${end_time} has been confirmed.`,
        'booking_confirmed'
      ]
    );

    // Also update any queue entry for this user and GPU if they were waiting
    try {
      await pool.query(
        `UPDATE queue SET status = 'expired' WHERE user_id = $1 AND gpu_id = $2 AND status = 'waiting'`,
        [req.user.id, gpu_id]
      );
    } catch {
      // queue entry update is optional
    }

    res.status(201).json(reservation);
  } catch (err) {
    console.error('Create reservation error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/reservations/:id/cancel - Cancel reservation (owner or admin)
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    // Get the reservation
    const reservation = await pool.query(
      'SELECT id, user_id, gpu_id, date, start_time, end_time FROM reservations WHERE id = $1',
      [req.params.id]
    );

    if (reservation.rows.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    const resData = reservation.rows[0];

    // Check if user is the owner or admin
    if (resData.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to cancel this reservation' });
    }

    // Update status to cancelled
    await pool.query(
      "UPDATE reservations SET status = 'cancelled' WHERE id = $1",
      [req.params.id]
    );

    // Get GPU model for the notification message
    const gpuResult = await pool.query('SELECT model FROM gpus WHERE id = $1', [resData.gpu_id]);
    const gpuModel = gpuResult.rows.length > 0 ? gpuResult.rows[0].model : 'Unknown GPU';
    const dateFormatted = resData.date instanceof Date ? resData.date.toISOString().split('T')[0] : resData.date;

    // Create a notification for the user whose reservation was cancelled
    await pool.query(
      `INSERT INTO notifications (user_id, message, type)
       VALUES ($1, $2, $3)`,
      [
        resData.user_id,
        `Your reservation for ${gpuModel} on ${dateFormatted} from ${resData.start_time} to ${resData.end_time} has been cancelled.`,
        'booking_cancelled'
      ]
    );

    // Queue allocation & notification: Check if any user is waiting in the queue for this GPU
    try {
      const nextInQueue = await pool.query(
        `SELECT q.id, q.user_id
         FROM queue q
         WHERE q.gpu_id = $1 AND q.status = 'waiting'
         ORDER BY q.position ASC
         LIMIT 1`,
        [resData.gpu_id]
      );

      if (nextInQueue.rows.length > 0) {
        const queuedUser = nextInQueue.rows[0];
        // Update queue status
        await pool.query(
          `UPDATE queue SET status = 'notified' WHERE id = $1`,
          [queuedUser.id]
        );

        // Notify queued user that a slot has become available
        await pool.query(
          `INSERT INTO notifications (user_id, message, type)
           VALUES ($1, $2, 'queue_update')`,
          [
            queuedUser.user_id,
            `Great news! A reservation slot for ${gpuModel} was cancelled. You are next in line to book this GPU.`
          ]
        );
      }
    } catch (queueErr) {
      console.warn('Queue notification notice:', queueErr.message);
    }

    res.json({ message: 'Reservation cancelled successfully' });
  } catch (err) {
    console.error('Cancel reservation error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
