// Custom header blocks simple cross-origin form requests, including login CSRF.
// Authenticated mutations additionally validate the session's synchronizer token.
const production = process.env.NODE_ENV === 'production';
const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim());
if (production && (!process.env.FRONTEND_ORIGIN || origins.some(origin => !/^https:\/\/[^/]+$/.test(origin)))) {
  throw new Error('Production requires explicit HTTPS FRONTEND_ORIGIN values');
}
function csrfOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('Origin');
  if (req.get('X-Requested-With') !== 'GPUspace' || (origin && !origins.includes(origin))) {
    return res.status(403).json({ message: 'Request origin could not be verified. Reload the page and try again.', code: 'CSRF_INVALID' });
  }
  next();
}
module.exports = { csrfOrigin, origins };
