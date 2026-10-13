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

    const station = await db.getStationById(stationId);
    if (station?.is_barologger) {
      const data = await db.getBarologgerSeries(stationId, from, to);
      return res.json({ station_id: stationId, from, to, mode: 'barologger', count: data.length, data });
    }

    const rows = await db.getGroundwaterLevels(stationId, from, to);
    // Depth below ground surface = dipper − casing height = elevation_m − level_m_asl (gw_f2_driffter2.r)
    const elev = station?.elevation_m != null ? parseFloat(station.elevation_m) : null;
    const data = rows.map(r => ({
      ...r,
      depth_to_water_m: elev != null && r.level_m_asl != null
        ? parseFloat((elev - parseFloat(r.level_m_asl)).toFixed(3))
        : null,
    }));
    res.json({ station_id: stationId, from, to, mode: 'level', count: data.length, data });
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
