const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(s => s.trim()));
app.disable('x-powered-by');
app.use(require('helmet')());
// Middleware
app.use(cors({
  origin: require('./middleware/csrf').origins,
  credentials: true
}));
app.use(express.json({ limit: '16kb' }));
app.use(require('cookie-parser')());
app.use('/api', require('./middleware/csrf').csrfOrigin);

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.body === null) return res.status(400).json({ message: 'JSON object required' });
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/gpus', require('./routes/gpus'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/queue', require('./routes/queue'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/ready', async (req, res) => {
  try { await require('./config/db').query('SELECT 1'); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err.stack);
  res.status(err.status === 413 ? 413 : err.type === 'entity.parse.failed' ? 400 : 500).json({ message: err.status === 413 ? 'Request too large' : err.type === 'entity.parse.failed' ? 'Invalid JSON body' : 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) require('./config/db').ready.then(() => {
  const pool = require('./config/db');
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  const cleanup = async () => {
    try {
      await pool.query('DELETE FROM auth_sessions WHERE expires_at < $1', [new Date()]);
      await pool.query('DELETE FROM auth_rate_limits WHERE reset_at < $1', [new Date()]);
    } catch (error) { console.error('Session cleanup failed:', error.message); }
  };
  cleanup();
  const timer = setInterval(cleanup, 15 * 60000); timer.unref();
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true; clearInterval(timer);
    const deadline = setTimeout(() => process.exit(1), 15000); deadline.unref();
    server.close(() => pool.end().finally(() => { clearTimeout(deadline); process.exitCode = 0; }));
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}).catch(err => {
  console.error('Database initialization failed:', err.message);
  process.exitCode = 1;
});

module.exports = app;
