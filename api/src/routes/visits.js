const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');

// POST /api/visits — creates a draft visit; visited_at defaults to NOW() if omitted
router.post('/', async (req, res, next) => {
  try {
    const { station_id, technician_id, visited_at, notes, status } = req.body;

    if (!station_id || !technician_id) {
      return res.status(400).json({ error: 'station_id and technician_id are required' });
    }

    const visit = await db.createFieldVisit({
      stationId:    station_id,
      technicianId: technician_id,
      visitedAt:    visited_at || null,   // defaults to NOW() in DB
      notes,
      status:       status || 'draft',
    });

    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

// GET /api/visits?station_id=&status=
router.get('/', async (req, res, next) => {
  try {
    const stationId    = req.query.station_id    ? parseInt(req.query.station_id, 10)    : undefined;
    const technicianId = req.query.technician_id ? parseInt(req.query.technician_id, 10) : undefined;
    const status       = req.query.status || undefined;
    const visits       = await db.getAllVisits({ stationId, status, technicianId });
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

    res.json(visit);
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
