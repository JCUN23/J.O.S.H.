// Shared HTTP plumbing.
// Note: Express 5 forwards rejected promises from async handlers to the error
// middleware automatically, so no asyncHandler() wrapper is needed.

// Unknown /api routes get JSON 404s. Without this, the SPA fallback would answer
// with index.html and the frontend's res.json() would blow up with a confusing parse error.
function apiNotFound(req, res) {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
}

// Last-resort error handler: consistent JSON, upstream status when it's an axios error.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const upstream = err.response?.status;
  const status = err.status || err.statusCode || (upstream ? 502 : 500);
  console.error(`[${req.method} ${req.originalUrl}] ${status}:`, err.response?.data || err.message);
  res.status(status).json({ error: err.expose ? err.message : status === 502 ? 'Upstream service error' : 'Internal server error' });
}

module.exports = { apiNotFound, errorHandler };
