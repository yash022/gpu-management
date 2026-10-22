// Custom header blocks simple cross-origin form requests, including login CSRF.
// Authenticated mutations additionally validate the session's synchronizer token.
const production = process.env.NODE_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_URL);

const baseOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (process.env.VERCEL_URL) {
  baseOrigins.push(`https://${process.env.VERCEL_URL}`);
}
if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  baseOrigins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
}

const origins = Array.from(new Set(baseOrigins));

if (production && !isVercel && (!process.env.FRONTEND_ORIGIN || origins.some(origin => !/^https:\/\/[^/]+$/.test(origin)))) {
  throw new Error('Production requires explicit HTTPS FRONTEND_ORIGIN values');
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (origins.includes(origin)) return true;
  if (isVercel && /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) return true;
  return false;
}

function csrfOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('Origin');
  if (req.get('X-Requested-With') !== 'GPUspace' || !isOriginAllowed(origin)) {
    return res.status(403).json({ message: 'Request origin could not be verified. Reload the page and try again.', code: 'CSRF_INVALID' });
  }
  next();
}

module.exports = { csrfOrigin, origins, isOriginAllowed };
