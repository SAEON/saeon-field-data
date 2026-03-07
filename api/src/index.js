const express = require('express');
const cors    = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./db/pool');
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
app.use('/api/dashboard', require('./routes/dashboard')); // GET /api/dashboard/*

// Error handler — must be last
app.use(require('./middleware/error'));

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);

  // On startup: resume any files left in 'pending' state (e.g. process killed mid-parse)
  const db            = require('./db/queries');
  const { parseInBackground } = require('./routes/files');
  setImmediate(async () => {
    try {
      const pending = await db.getUnparsedFiles();
      if (pending.length) {
        console.log(`Resuming parse for ${pending.length} pending file(s)...`);
        for (const f of pending) {
          setImmediate(() => parseInBackground(f, f.visit_id));
        }
      }
    } catch (e) {
      console.error('Startup reparse sweep failed:', e.message);
    }
  });
});
