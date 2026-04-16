const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole, ROLE_HIERARCHY } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/stations
// ?registry=true (technician_lead+) — includes inactive stations for the registry UI
router.get('/', async (req, res, next) => {
  try {
    const callerLevel = ROLE_HIERARCHY[req.user.roles[0]] ?? 0;
    if (req.query.registry === 'true' && callerLevel >= ROLE_HIERARCHY['technician_lead']) {
      const stations = await db.getAllStationsRegistry();
      return res.json(stations);
    }
    const assignedTo = callerLevel < ROLE_HIERARCHY['technician_lead'] ? req.user.id : null;
    const stations = await db.getAllStationsWithLastVisit(assignedTo);
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

// =============================================================
// POST /api/stations  (technician_lead only)
// =============================================================
router.post('/', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const {
      name, display_name, data_family, region,
      latitude, longitude, elevation_m, notes,
      visit_frequency_days, assigned_technician_id, serial_no,
    } = req.body;

    if (!name || !display_name || !data_family) {
      return res.status(400).json({ error: 'name, display_name, and data_family are required' });
    }

    const station = await db.createStation({
      name, displayName: display_name, dataFamily: data_family,
      region, latitude, longitude, elevationM: elevation_m,
      notes, visitFrequencyDays: visit_frequency_days,
      assignedTechnicianId: assigned_technician_id, serialNo: serial_no ?? null,
    });

    res.status(201).json(station);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Station name already exists' });
    next(err);
  }
});

// =============================================================
// PATCH /api/stations/:id  (technician_lead only)
// =============================================================
router.patch('/:id', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const station = await db.getStationById(id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const {
      name, display_name, data_family, region,
      latitude, longitude, elevation_m, notes,
      visit_frequency_days, assigned_technician_id, active, serial_no,
    } = req.body;

    const updated = await db.updateStation(id, {
      name, displayName: display_name, dataFamily: data_family,
      region, latitude, longitude, elevationM: elevation_m,
      notes, visitFrequencyDays: visit_frequency_days,
      assignedTechnicianId: assigned_technician_id, active,
      serialNo: serial_no,
    });

    res.json(updated);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Station name already exists' });
    next(err);
  }
});

// =============================================================
// DELETE /api/stations/:id  (technician_lead only — soft delete)
// Sets active = false. Hard delete not permitted (visit history preserved).
// =============================================================
router.delete('/:id', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const station = await db.getStationById(id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    await db.deactivateStation(id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
