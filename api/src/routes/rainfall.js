// rainfall.js — query processed rainfall data and trigger re-processing.

const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole } = require('../middleware/auth');
const { processRainfall } = require('../processors/rainfall');

const VALID_RESOLUTIONS = ['5min', 'hourly', 'daily', 'saws_daily', 'monthly', 'yearly'];

router.use(requireAuth);

// GET /api/stations/:id/rainfall
router.get('/:id/rainfall', async (req, res, next) => {
  try {
    const stationId  = parseInt(req.params.id, 10);
    const resolution = req.query.resolution || 'daily';

    if (!VALID_RESOLUTIONS.includes(resolution)) {
      return res.status(400).json({ error: `resolution must be one of: ${VALID_RESOLUTIONS.join(', ')}` });
    }

    const defaultFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const from = req.query.from || defaultFrom;
    const to   = req.query.to   || new Date().toISOString();

    const data = await db.getRainfallData(stationId, from, to, resolution);
    res.json({ station_id: stationId, resolution, from, to, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/stations/:id/rainfall/process
router.post('/:id/rainfall/process', requireRole('technician_lead', 'data_manager'), async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const station   = await db.getStationById(stationId);

    if (!station)                            return res.status(404).json({ error: 'Station not found' });
    if (station.data_family !== 'rainfall')  return res.status(400).json({ error: 'Not a rainfall station' });

    const result = await processRainfall(stationId);
    res.json({ ok: true, station_id: stationId, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
