const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/gpus - List all GPUs
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, model, vram, status, location, created_at FROM gpus ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('Get GPUs error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/gpus/:id - Single GPU details
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, model, vram, status, location, created_at FROM gpus WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'GPU not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get GPU error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/gpus - Admin only, create GPU
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { model, vram, status, location } = req.body;

    const result = await pool.query(
      'INSERT INTO gpus (model, vram, status, location) VALUES ($1, $2, $3, $4) RETURNING id, model, vram, status, location, created_at',
      [model, vram, status || 'available', location]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create GPU error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/gpus/:id - Admin only, update GPU
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { model, vram, status, location } = req.body;

    const result = await pool.query(
      'UPDATE gpus SET model = $1, vram = $2, status = $3, location = $4 WHERE id = $5 RETURNING id, model, vram, status, location, created_at',
      [model, vram, status, location, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'GPU not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update GPU error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/gpus/:id - Admin only, delete GPU
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM gpus WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'GPU not found' });
    }

    res.json({ message: 'GPU deleted successfully' });
  } catch (err) {
    console.error('Delete GPU error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
