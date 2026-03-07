const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');

// GET /api/dashboard/visits/recent?limit=20
router.get('/visits/recent', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const visits = await db.getRecentVisitsAllStations(limit);
    res.json(visits);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/stations/overdue?since=YYYY-MM-DD
// Returns stations not visited since the given date (default: 90 days ago).
router.get('/stations/overdue', async (req, res, next) => {
  try {
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    if (isNaN(since.getTime())) {
      return res.status(400).json({ error: 'Invalid since date' });
    }

    const stations = await db.getStationsNotVisitedSince(since);
    res.json(stations);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/stations/missing-dipper
// Groundwater stations whose most recent visit has no dipper depth reading.
router.get('/stations/missing-dipper', async (req, res, next) => {
  try {
    const stations = await db.getGroundwaterStationsMissingDipper();
    res.json(stations);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/files/errors
// Files with parse_status = 'error' — for ops monitoring.
router.get('/files/errors', async (req, res, next) => {
  try {
    const files = await db.getFilesWithParseErrors();
    res.json(files);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
