const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/validation').resourceId);
router.param('gpuId', require('../middleware/validation').resourceId);
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

// GET /api/notifications - User's notifications ordered by created_at DESC
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, message, type, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get notifications error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/notifications/:id/read - Mark single notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark notification read error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/notifications/read-all - Mark all user's notifications as read
router.put('/read-all', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all notifications read error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
