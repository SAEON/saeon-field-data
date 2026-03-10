const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');

// GET /api/stations
router.get('/', async (req, res, next) => {
  try {
    const stations = await db.getAllStationsWithLastVisit();
    res.json(stations);
  } catch (err) {
    next(err);
  }
});

// GET /api/stations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id      = parseInt(req.params.id, 10);
    const station = await db.getStationById(id);

    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }

    const [streams, lastVisit] = await Promise.all([
      db.getStationStreams(id),
      db.getStationLastVisit(id),
    ]);

    res.json({ ...station, streams, last_visit: lastVisit });
  } catch (err) {
    next(err);
  }
});

// GET /api/stations/:id/coverage
// Data date coverage per stream for a station.
router.get('/:id/coverage', async (req, res, next) => {
  try {
    const id       = parseInt(req.params.id, 10);
    const station  = await db.getStationById(id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const coverage = await db.getStationDataCoverage(id);
    res.json({ station_id: id, coverage });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
