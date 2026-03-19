// Minimal structured logger — no dependencies, writes to stdout/stderr.
// Format: [ISO timestamp] LEVEL  message  key=value ...

function fmt(level, msg, ctx = {}) {
  const ts      = new Date().toISOString();
  const pairs   = Object.entries(ctx).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
  const line    = pairs ? `${msg}  ${pairs}` : msg;
  const padded  = level.padEnd(5);
  return `[${ts}] ${padded} ${line}`;
}

const log = {
  info(msg, ctx)  { console.log(fmt('INFO',  msg, ctx)); },
  warn(msg, ctx)  { console.warn(fmt('WARN',  msg, ctx)); },
  error(msg, ctx) { console.error(fmt('ERROR', msg, ctx)); },
};

// HTTP request logger middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms    = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level](`${req.method} ${req.path}`, {
      status: res.statusCode,
      ms,
      ip: req.ip || req.socket?.remoteAddress,
    });
  });
  next();
}

module.exports = { log, requestLogger };
