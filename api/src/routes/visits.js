const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');

// POST /api/visits
router.post('/', async (req, res, next) => {
  try {
    const { station_id, technician_id, visited_at, notes } = req.body;

    if (!station_id || !technician_id || !visited_at) {
      return res.status(400).json({ error: 'station_id, technician_id, and visited_at are required' });
    }

    const visit = await db.createFieldVisit({
      stationId:    station_id,
      technicianId: technician_id,
      visitedAt:    visited_at,
      notes,
    });

    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

// GET /api/visits?station_id=
router.get('/', async (req, res, next) => {
  try {
    const stationId = req.query.station_id ? parseInt(req.query.station_id, 10) : undefined;
    const visits    = await db.getAllVisits({ stationId });
    res.json(visits);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/visits/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const { status } = req.body;

    const VALID = ['pending', 'submitted', 'approved'];
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
