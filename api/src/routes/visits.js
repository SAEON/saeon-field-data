const express = require('express');
const SUBMITTED = ['submitted', 'approved', 'flagged'];   // notes written before submission are locked in these states

const router  = express.Router();
const fs      = require('fs');
const db      = require('../db/queries');
const { requireAuth, requireRole, ROLE_HIERARCHY } = require('../middleware/auth');
const { log } = require('../middleware/logger');
const { processRainfall } = require('../processors/rainfall');

router.use(requireAuth);

// POST /api/visits — creates a draft visit; technician resolved from auth token
router.post('/', async (req, res, next) => {
  try {
    const { station_id, visited_at, notes, status } = req.body;
    const client_ref = typeof req.body.client_ref === 'string' && req.body.client_ref.trim() ? req.body.client_ref.trim().slice(0, 100) : null;

    if (!station_id) {
      return res.status(400).json({ error: 'station_id is required' });
    }

    const visit = await db.createFieldVisit({
      stationId:    station_id,
      technicianId: req.user.id,
      visitedAt:    visited_at || null,
      notes,
      status:       status || 'draft',
      clientRef:    client_ref,
    });

    // Auto-assign visiting user to station — gives accountability visibility to other users
    await db.updateStation(station_id, { assignedTechnicianId: req.user.id });

    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

// GET /api/visits?station_id=&status=&technician_id=
// Technicians always see only their own visits.
// Leads/managers see all visits by default; passing technician_id filters to that person
// (used by HistoryTab so leads see only their own submitted visits, not all).
router.get('/', async (req, res, next) => {
  try {
    const stationId   = req.query.station_id   ? parseInt(req.query.station_id,   10) : undefined;
    const status      = req.query.status       || undefined;
    const callerLevel = ROLE_HIERARCHY[req.user.roles[0]] ?? 0;
    const isPriv      = callerLevel >= ROLE_HIERARCHY['technician_lead'];

    let technicianId;
    if (!isPriv) {
      technicianId = req.user.id;                             // technicians: always own
    } else if (req.query.technician_id) {
      technicianId = parseInt(req.query.technician_id, 10);  // leads/managers: opt-in filter
    }

    const visits = await db.getAllVisits({ stationId, status, technicianId });
    res.json(visits);
  } catch (err) {
    next(err);
  }
});

// POST /api/visits/:id — update visited_at and/or notes on a draft visit
router.post('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { visited_at, notes } = req.body;

    const existing = await db.getVisitById(id);
    if (!existing) return res.status(404).json({ error: 'Visit not found' });

    const isPriv = (ROLE_HIERARCHY[req.user.roles[0]] ?? 0) >= ROLE_HIERARCHY['technician_lead'];
    if (!isPriv && existing.technician_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own visits' });
    }
    if (SUBMITTED.includes(existing.status)) {
      return res.status(409).json({ error: 'Visit notes are locked once the visit is submitted. Add a follow-up note instead.' });
    }

    const visit = await db.updateVisitDetails(id, { visitedAt: visited_at, notes });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    res.json(visit);
  } catch (err) {
    next(err);
  }
});

// POST /api/visits/:id/followup-notes — add a follow-up note to a submitted visit.
// Append-only: the original visit notes are never changed.
router.post('/:id/followup-notes', async (req, res, next) => {
  try {
    const id   = parseInt(req.params.id, 10);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!note) return res.status(400).json({ error: 'note is required' });
    if (note.length > 5000) return res.status(400).json({ error: 'note is too long' });

    const visit = await db.getVisitById(id);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    if (!SUBMITTED.includes(visit.status)) return res.status(409).json({ error: 'Follow-up notes can only be added after the visit is submitted' });

    const isPriv = (ROLE_HIERARCHY[req.user.roles[0]] ?? 0) >= ROLE_HIERARCHY['technician_lead'];
    if (!isPriv && visit.technician_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only add notes to your own visits' });
    }

    res.status(201).json(await db.addVisitFollowupNote(id, req.user.id, note));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/visits/:id/followup-notes/:noteId — edit a follow-up note (its author only)
router.patch('/:id/followup-notes/:noteId', async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const noteId = parseInt(req.params.noteId, 10);
    const note   = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!note) return res.status(400).json({ error: 'note is required' });
    if (note.length > 5000) return res.status(400).json({ error: 'note is too long' });

    const existing = await db.getVisitFollowupNote(noteId);
    if (!existing || existing.visit_id !== id) return res.status(404).json({ error: 'Note not found' });

    // A follow-up note can only be changed by the person who wrote it
    if (existing.author_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own follow-up notes' });
    }

    res.json(await db.updateVisitFollowupNote(noteId, note, req.user.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/visits/:id/status
router.post('/:id/status', async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const { status } = req.body;

    const VALID = ['draft', 'pending', 'submitted', 'approved', 'flagged'];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    }

    const existing = await db.getVisitById(id);
    if (!existing) return res.status(404).json({ error: 'Visit not found' });

    const isPriv = (ROLE_HIERARCHY[req.user.roles[0]] ?? 0) >= ROLE_HIERARCHY['technician_lead'];
    if (!isPriv && existing.technician_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update status on your own visits' });
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
// POST /api/visits/:id/assign  (technician_lead only)
// Leads/managers assign an upcoming visit to a specific technician.
// =============================================================
router.post('/:id/assign', requireRole('technician_lead'), async (req, res, next) => {
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

    const [files, readings, followup_notes] = await Promise.all([
      db.getVisitFiles(id),
      db.getVisitReadings(id),
      db.getVisitFollowupNotes(id),
    ]);

    res.json({ ...visit, files, readings, followup_notes });
  } catch (err) {
    next(err);
  }
});

// POST /api/visits/:id/abandon — abandon a draft visit
router.post('/:id/abandon', async (req, res, next) => {
  try {
    const id    = parseInt(req.params.id, 10);
    const visit = await db.getVisitById(id);

    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    if (visit.status !== 'draft') return res.status(409).json({ error: 'Only draft visits can be abandoned' });
    if (visit.technician_id !== req.user.id) return res.status(403).json({ error: 'You can only abandon your own draft visits' });

    const storagePaths = await db.deleteDraftVisit(id);

    // Remove uploaded files from disk (best-effort — DB already cleaned up)
    for (const p of storagePaths) {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }

    log.info('[visit] Draft abandoned', { visit_id: id, files_deleted: storagePaths.length });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/visits/:id/logger-snapshot
// Returns the most recent temp and battery readings from parsed CSV data near
// the visit date — used to pre-populate the manual readings form.
router.get('/:id/logger-snapshot', async (req, res, next) => {
  try {
    const snapshot = await db.getLoggerSnapshotForVisit(parseInt(req.params.id, 10));
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
