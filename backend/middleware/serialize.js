// Keep the lab's in-memory database safe from overlapping writes in one process.
// PostgreSQL additionally uses row locks inside reservation transactions.
let tail = Promise.resolve();
module.exports = async (req, res, next) => {
  const pool = require('../config/db');
  try { await pool.ready; } catch (error) { return next(error); }
  if (!pool.isMemory) return next();
  const previous = tail;
  let release;
  tail = new Promise(resolve => { release = resolve; });
  await previous;
  res.once('finish', release);
  res.once('close', release);
  next();
};
