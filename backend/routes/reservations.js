const serialize = require('../middleware/serialize');
const { bookingBody } = require('../middleware/validation');
const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/validation').resourceId);
router.param('gpuId', require('../middleware/validation').resourceId);
const pool = require('../config/db');
const { withGpuLock, refreshLocked, offerNext, renumber, fail, dateKey, timeKey } = require('../config/queue-offers');
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

// All allocation paths share a database row lock on the GPU.
router.post('/', auth, bookingBody, serialize, async (req, res) => {
  try {
    const { gpu_id, date, start_time, end_time, purpose, queue_offer_id } = req.body;
    // Commit expiry transitions even when the subsequent booking is rejected.
    await withGpuLock(gpu_id, refreshLocked);
    const reservation = await withGpuLock(gpu_id, async (client, gpu) => {
      await refreshLocked(client, gpu);
      if (gpu.status !== 'available') throw fail(400, 'This GPU is not available for booking');
      const holds = await client.query("SELECT * FROM queue WHERE gpu_id = $1 AND offer_date = $2 AND status = 'notified' AND offer_start < $4 AND offer_end > $3", [gpu_id, date, start_time, end_time]);
      let ownOffer;
      for (const hold of holds.rows) {
        if (hold.user_id !== req.user.id) throw fail(409, 'This slot is temporarily held for the next waitlisted user. Choose another slot or join the waitlist.', 'SLOT_HELD');
        if (timeKey(hold.offer_start) !== start_time || timeKey(hold.offer_end) !== end_time) throw fail(409, 'Book the exact time slot shown in your queue offer.', 'OFFER_SLOT_MISMATCH');
        ownOffer = hold;
      }
      if (queue_offer_id !== undefined && (!ownOffer || String(ownOffer.id) !== String(queue_offer_id))) throw fail(409, 'Your offer has expired or is no longer available. Check your queue.', 'OFFER_EXPIRED');
      const conflict = await client.query("SELECT id FROM reservations WHERE gpu_id = $1 AND date = $2 AND status = 'confirmed' AND start_time < $4 AND end_time > $3", [gpu_id, date, start_time, end_time]);
      if (conflict.rows.length) throw fail(409, 'Time slot conflicts with an existing reservation', 'SLOT_BOOKED');
      const result = await client.query('INSERT INTO reservations (user_id, gpu_id, date, start_time, end_time, purpose) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.user.id, gpu_id, date, start_time, end_time, purpose]);
      const booked = result.rows[0];
      await client.query("INSERT INTO notifications (user_id, message, type) VALUES ($1,$2,'booking_confirmed')", [req.user.id, `Your reservation for ${gpu.model} on ${date} from ${start_time} to ${end_time} IST has been confirmed.`]);
      if (ownOffer) await client.query("UPDATE queue SET status = 'expired', reservation_id = $1 WHERE id = $2", [booked.id, ownOffer.id]);
      await client.query("UPDATE queue SET status = 'expired', reservation_id = $3 WHERE user_id = $1 AND gpu_id = $2 AND status = 'waiting'", [req.user.id, gpu_id, booked.id]);
      await renumber(client, gpu_id);
      return booked;
    });
    res.status(201).json(reservation);
  } catch (error) {
    if (!error.status) console.error('Create reservation error:', error.message);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to create reservation. Please retry.', code: error.status ? error.code : undefined });
  }
});

router.put('/:id/cancel', auth, serialize, async (req, res) => {
  try {
    const found = await pool.query('SELECT gpu_id FROM reservations WHERE id = $1', [req.params.id]);
    if (!found.rows.length) throw fail(404, 'Reservation not found');
    await withGpuLock(found.rows[0].gpu_id, async (client, gpu) => {
      await refreshLocked(client, gpu);
      const result = await client.query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
      const reservation = result.rows[0];
      if (!reservation) throw fail(404, 'Reservation not found');
      if (reservation.user_id !== req.user.id && req.user.role !== 'admin') throw fail(403, 'Not authorized to cancel this reservation');
      if (reservation.status !== 'confirmed') throw fail(409, 'Only confirmed reservations can be cancelled');
      await client.query("UPDATE reservations SET status = 'cancelled' WHERE id = $1", [reservation.id]);
      await client.query("INSERT INTO notifications (user_id, message, type) VALUES ($1,$2,'booking_cancelled')", [reservation.user_id, `Your reservation for ${gpu.model} on ${dateKey(reservation.date)} from ${timeKey(reservation.start_time)} to ${timeKey(reservation.end_time)} IST has been cancelled.`]);
      await offerNext(client, gpu, reservation);
    });
    res.json({ message: 'Reservation cancelled successfully' });
  } catch (error) {
    if (!error.status) console.error('Cancel reservation error:', error.message);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to cancel reservation. Please retry.' });
  }
});
module.exports = router;
