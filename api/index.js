// Vercel Serverless Function — wraps the Express backend as a single handler.
// All /api/* requests are routed here by vercel.json rewrites.
const app = require('../backend/server');
module.exports = app;
