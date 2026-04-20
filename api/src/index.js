const express = require('express');
const cors    = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./db/pool');
const { log, requestLogger } = require('./middleware/logger');
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health — server alive
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Health — database reachable
app.get('/health/db', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW() AS time');
    res.json({ status: 'ok', db: process.env.DB_NAME, time: result.rows[0].time });
  } catch (err) {
    next(err);
  }
});

// Routes
app.use('/api/stations',  require('./routes/stations'));
app.use('/api/visits',    require('./routes/visits'));
app.use('/api/visits',    require('./routes/files'));     // POST /api/visits/:id/files
app.use('/api/visits',    require('./routes/readings'));  // POST /api/visits/:id/readings
app.use('/api/files',     require('./routes/files'));     // GET /api/files/:id/download, POST /api/files/:id/reparse
app.use('/api/streams',   require('./routes/streams'));   // GET /api/streams/:id/measurements
app.use('/api/stations', require('./routes/rainfall'));    // GET/POST /api/stations/:id/rainfall[/process]
app.use('/api/stations', require('./routes/instruments')); // GET/POST /api/stations/:id/instruments
app.use('/api/users',     require('./routes/users'));     // GET/POST/PATCH /api/users
app.use('/api/dashboard', require('./routes/dashboard')); // GET /api/dashboard/*

// Error handler — must be last
app.use(require('./middleware/error'));

app.listen(PORT, () => {
  log.info('API started', { port: PORT, db: process.env.DB_NAME, node: process.version });

  // On startup: resume any files left in 'pending' state (e.g. process killed mid-parse)
  const db            = require('./db/queries');
  const { parseInBackground } = require('./routes/files');
  setImmediate(async () => {
    try {
      const pending = await db.getUnparsedFiles();
      if (pending.length) {
        log.warn('Resuming pending files from previous run', { count: pending.length });
        for (const f of pending) {
          setImmediate(() => parseInBackground(f, f.visit_id));
        }
      }
    } catch (e) {
      log.error('Startup reparse sweep failed', { error: e.message });
    }
  });
});
