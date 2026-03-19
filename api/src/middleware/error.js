const { log } = require('./logger');

module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    log.error(`${req.method} ${req.path} — unhandled error`, {
      status,
      error: err.message,
      stack: err.stack?.split('\n')[1]?.trim(),
    });
  }
  res.status(status).json({ error: err.message || 'Internal server error' });
};
