const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth } = require('../middleware/auth');
const { processRainfall } = require('../processors/rainfall');

router.use(requireAuth);

// GET /api/stations/:id/instruments
router.get('/:id/instruments', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const station   = await db.getStationById(stationId);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const history = await db.getInstrumentHistory(stationId);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

// POST /api/stations/:id/instruments
// Records an instrument swap. All roles may record.
// effective_from is derived from the linked visit's visited_at.
router.post('/:id/instruments', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const { instrument_type, serial_no, mm_per_tip, visit_id, notes } = req.body;

    if (!instrument_type || !serial_no) {
      return res.status(400).json({ error: 'instrument_type and serial_no are required' });
    }
    if (!['raingauge', 'datalogger'].includes(instrument_type)) {
      return res.status(400).json({ error: 'instrument_type must be raingauge or datalogger' });
    }
    if (instrument_type === 'raingauge' && mm_per_tip == null) {
      return res.status(400).json({ error: 'mm_per_tip is required for raingauge' });
    }
    if (!visit_id) {
      return res.status(400).json({ error: 'visit_id is required to anchor the effective date' });
    }

    const station = await db.getStationById(stationId);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const visit = await db.getVisitById(parseInt(visit_id, 10));
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const effectiveFrom = visit.visited_at || visit.created_at;

    const record = await db.createInstrumentRecord({
      stationId,
      instrumentType: instrument_type,
      serialNo:       serial_no,
      mmPerTip:       mm_per_tip ?? null,
      visitId:        parseInt(visit_id, 10),
      effectiveFrom,
      recordedBy:     req.user.id,
      notes,
    });

    // Keep stations.serial_no in sync with the latest registered serial
    await db.updateStation(stationId, { serialNo: serial_no });

    // Rainfall reprocess — calibration may have changed
    if (station.data_family === 'rainfall' && instrument_type === 'raingauge') {
      setImmediate(() =>
        processRainfall(stationId).catch(e =>
          console.error(`Rainfall reprocess failed for station ${stationId}:`, e.message)
        )
      );
    }

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
