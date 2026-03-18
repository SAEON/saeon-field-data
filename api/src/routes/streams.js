const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/streams/:id/measurements?from=&to=&limit=
// Returns parsed measurements for a data stream within a date range.
// Defaults: last 30 days, max 10 000 rows.
router.get('/:id/measurements', async (req, res, next) => {
  try {
    const streamId = parseInt(req.params.id, 10);
    const limit    = Math.min(parseInt(req.query.limit || '10000', 10), 10000);

    const to   = req.query.to   ? new Date(req.query.to)   : new Date();
    const from = req.query.from ? new Date(req.query.from)  : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid from or to date' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'from must be before to' });
    }

    const measurements = await db.getMeasurementsByStream(streamId, from, to, limit);
    res.json({ stream_id: streamId, from, to, count: measurements.length, measurements });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
