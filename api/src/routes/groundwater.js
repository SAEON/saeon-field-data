// groundwater.js — query processed groundwater levels and trigger re-processing.

const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole } = require('../middleware/auth');
const { processGroundwater } = require('../processors/groundwater');

router.use(requireAuth);

// GET /api/stations/:id/groundwater?from=&to=
router.get('/:id/groundwater', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const from = req.query.from || null;
    const to   = req.query.to   || null;

    const data = await db.getGroundwaterLevels(stationId, from, to);
    res.json({ station_id: stationId, from, to, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/stations/:id/groundwater/process
router.post('/:id/groundwater/process', requireRole('data_manager'), async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const result = await processGroundwater(stationId);
    res.json({ station_id: stationId, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
