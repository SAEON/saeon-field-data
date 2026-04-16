const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole, ROLE_HIERARCHY } = require('../middleware/auth');

router.use(requireAuth);

// =============================================================
// GET /api/dashboard/stations   (data_manager only)
// All active stations with last visit date + days_since_visit.
// =============================================================
router.get('/stations', requireRole('data_manager'), async (req, res, next) => {
  try {
    const stations = await db.getAllStationsWithLastVisit();
    // Annotate days_since_visit server-side for consistency
    const now = Date.now();
    const annotated = stations.map(s => ({
      ...s,
      days_since_visit: s.last_visited_at
        ? Math.floor((now - new Date(s.last_visited_at).getTime()) / 86400000)
        : null,
    }));
    res.json(annotated);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// GET /api/dashboard/overdue   (technician_lead+)
// Stations exceeding their per-station visit_frequency_days since last submitted visit.
// =============================================================
router.get('/overdue', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const stations = await db.getOverdueStations();
    res.json(stations);
  } catch (err) {
    next(err);
  }
});

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
// Files with parse_status = 'error'. Privileged users see everything;
// plain technicians see only errors on their assigned stations.
router.get('/files/errors', async (req, res, next) => {
  try {
    const isPriv = (ROLE_HIERARCHY[req.user.roles[0]] ?? 0) >= ROLE_HIERARCHY['technician_lead'];
    const files  = await db.getFilesWithParseErrors({ technicianId: isPriv ? null : req.user.id });
    res.json(files);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
