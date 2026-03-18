const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole } = require('../middleware/auth');
const { processRainfall } = require('../processors/rainfall');

router.use(requireAuth);

// POST /api/visits — creates a draft visit; technician resolved from auth token
router.post('/', async (req, res, next) => {
  try {
    const { station_id, visited_at, notes, status } = req.body;

    if (!station_id) {
      return res.status(400).json({ error: 'station_id is required' });
    }

    const visit = await db.createFieldVisit({
      stationId:    station_id,
      technicianId: req.user.id,
      visitedAt:    visited_at || null,
      notes,
      status:       status || 'draft',
    });

    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

// GET /api/visits?station_id=&status=
// Managers/leads see all visits; technicians see only their own
router.get('/', async (req, res, next) => {
  try {
    const stationId = req.query.station_id ? parseInt(req.query.station_id, 10) : undefined;
    const status    = req.query.status || undefined;
    const isManager = req.user.roles.some(r => ['data_manager', 'technician_lead'].includes(r));
    const technicianId = isManager ? undefined : req.user.id;
    const visits = await db.getAllVisits({ stationId, status, technicianId });
    res.json(visits);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/visits/:id — update visited_at and/or notes on a draft visit
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { visited_at, notes } = req.body;

    const visit = await db.updateVisitDetails(id, { visitedAt: visited_at, notes });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    res.json(visit);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/visits/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const { status } = req.body;

    const VALID = ['draft', 'pending', 'submitted', 'approved', 'flagged'];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    }

    const visit = await db.updateVisitStatus(id, status);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    // When a rainfall visit is submitted, re-run rainfall processing async
    if (status === 'submitted') {
      const station = await db.getStationById(visit.station_id);
      if (station?.data_family === 'rainfall') {
        setImmediate(() =>
          processRainfall(visit.station_id).catch(e =>
            console.error(`Rainfall processing failed for station ${visit.station_id}:`, e.message)
          )
        );
      }
    }

    res.json(visit);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// PATCH /api/visits/:id/assign  (technician_lead only)
// Sue assigns an upcoming visit to a specific technician.
// =============================================================
router.patch('/:id/assign', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const visitId      = parseInt(req.params.id, 10);
    const technicianId = req.body.technician_id ? parseInt(req.body.technician_id, 10) : null;

    const visit = await db.getVisitById(visitId);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const updated = await db.assignVisit(visitId, technicianId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/visits/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id    = parseInt(req.params.id, 10);
    const visit = await db.getVisitById(id);

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    const [files, readings] = await Promise.all([
      db.getVisitFiles(id),
      db.getVisitReadings(id),
    ]);

    res.json({ ...visit, files, readings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
