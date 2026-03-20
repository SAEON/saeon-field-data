const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// POST /api/visits/:id/readings
router.post('/:id/readings', async (req, res, next) => {
  try {
    const visitId = parseInt(req.params.id, 10);

    const visit = await db.getVisitById(visitId);
    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    const { reading_type, value_numeric, value_text, unit, recorded_at, notes } = req.body;

    if (!reading_type || !recorded_at) {
      return res.status(400).json({ error: 'reading_type and recorded_at are required' });
    }

    const reading = await db.createManualReading({
      visitId,
      readingType:  reading_type,
      valueNumeric: value_numeric ?? null,
      valueText:    value_text    ?? null,
      unit:         unit          ?? null,
      recordedAt:   recorded_at,
      notes:        notes         ?? null,
    });

    res.status(201).json(reading);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/visits/:id/readings/:readingType
router.delete('/:id/readings/:readingType', async (req, res, next) => {
  try {
    const visitId     = parseInt(req.params.id, 10);
    const readingType = req.params.readingType;
    await db.deleteReadingByType(visitId, readingType);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
