const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/admin/stats - Admin dashboard stats
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const totalGpus = await pool.query('SELECT COUNT(*) FROM gpus');
    const activeReservations = await pool.query(
      "SELECT COUNT(*) FROM reservations WHERE status = 'confirmed'"
    );
    const gpusAvailable = await pool.query(
      "SELECT COUNT(*) FROM gpus WHERE status = 'available'"
    );
    const gpusMaintenance = await pool.query(
      "SELECT COUNT(*) FROM gpus WHERE status = 'maintenance'"
    );
    const waitingQueue = await pool.query(
      "SELECT COUNT(*) FROM queue WHERE status = 'waiting'"
    );

    res.json({
      total_users: parseInt(totalUsers.rows[0].count),
      total_gpus: parseInt(totalGpus.rows[0].count),
      active_reservations: parseInt(activeReservations.rows[0].count),
      gpus_available: parseInt(gpusAvailable.rows[0].count),
      gpus_maintenance: parseInt(gpusMaintenance.rows[0].count),
      waiting_in_queue: parseInt(waitingQueue.rows[0].count)
    });
  } catch (err) {
    console.error('Get admin stats error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/users - List all registered users
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get users error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/role - Change user role
router.put('/users/:id/role', auth, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['student', 'faculty', 'researcher', 'admin'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role',
      [role, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update user role error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id - Delete a user
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own admin account' });
    }

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User removed successfully' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports - Usage monitoring & reporting
router.get('/reports', auth, adminOnly, async (req, res) => {
  try {
    const reservationsByGpu = await pool.query(
      `SELECT g.model, COUNT(r.id) AS reservation_count
       FROM gpus g
       LEFT JOIN reservations r ON g.id = r.gpu_id
       GROUP BY g.model
       ORDER BY reservation_count DESC`
    );

    const reservationsByRole = await pool.query(
      `SELECT u.role, COUNT(r.id) AS count
       FROM users u
       LEFT JOIN reservations r ON u.id = r.user_id
       GROUP BY u.role`
    );

    res.json({
      gpu_utilization: reservationsByGpu.rows,
      role_distribution: reservationsByRole.rows
    });
  } catch (err) {
    console.error('Get reports error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
