const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth } = require('../middleware/auth');

const SOIL_CATEGORIES = new Set(['soil', 'leaf_wetness']);
const VALID_PARAMETERS = new Set(['temperature', 'humidity', 'pressure']);

router.use(requireAuth);

router.get('/met/instrument-types', async (req, res, next) => {
  try {
    const types = await db.getAllMetInstrumentTypes();
    res.json(types);
  } catch (err) {
    next(err);
  }
});

router.get('/met/instrument-types/:category', async (req, res, next) => {
  try {
    const types = await db.getMetInstrumentTypesByCategory(req.params.category);
    res.json(types);
  } catch (err) {
    next(err);
  }
});

router.get('/met/transfer-standards', async (req, res, next) => {
  try {
    const standards = await db.getActiveTransferStandards();
    res.json(standards);
  } catch (err) {
    next(err);
  }
});

router.get('/stations/:id/sensors', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const station   = await db.getStationById(stationId);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const sensors = await db.getActiveSensorsForStation(stationId);
    res.json(sensors);
  } catch (err) {
    next(err);
  }
});

router.get('/stations/:id/sensors/history', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const station   = await db.getStationById(stationId);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const history = await db.getSensorHistoryForStation(stationId);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

router.post('/stations/:id/sensors', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const { instrument_type_id, serial_no, sensitivity_value, visit_id, effective_from, notes } = req.body;

    if (!instrument_type_id) {
      return res.status(400).json({ error: 'instrument_type_id is required' });
    }
    if (!visit_id && !effective_from) {
      return res.status(400).json({ error: 'visit_id or effective_from is required' });
    }

    const station = await db.getStationById(stationId);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    let effectiveFrom;
    if (visit_id) {
      const visit = await db.getVisitById(parseInt(visit_id, 10));
      if (!visit) return res.status(404).json({ error: 'Visit not found' });
      effectiveFrom = visit.visited_at || visit.created_at;
    } else {
      effectiveFrom = effective_from;
    }

    const typeRow = await db.getMetInstrumentTypeById(parseInt(instrument_type_id, 10));
    if (!typeRow) return res.status(400).json({ error: 'instrument_type_id not found' });

    if (!SOIL_CATEGORIES.has(typeRow.category) && !serial_no) {
      return res.status(400).json({ error: 'serial_no is required for this sensor type' });
    }
    if (typeRow.requires_sensitivity && sensitivity_value == null) {
      return res.status(400).json({ error: 'sensitivity_value is required for this sensor type' });
    }

    const record = await db.assignSensorToStation({
      stationId,
      instrumentTypeId:  parseInt(instrument_type_id, 10),
      serialNo:          serial_no ?? null,
      sensitivityValue:  sensitivity_value ?? null,
      effectiveFrom,
      deployedBy:        req.user.id,
      visitId:           visit_id ? parseInt(visit_id, 10) : null,
      notes:             notes ?? null,
    });

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.patch('/stations/:id/sensors/:sensorId/decommission', async (req, res, next) => {
  try {
    const row = await db.decommissionSensor(parseInt(req.params.sensorId, 10));
    if (!row) return res.status(404).json({ error: 'Sensor not found or already decommissioned' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.get('/visits/:id/calibration-checks', async (req, res, next) => {
  try {
    const visitId = parseInt(req.params.id, 10);
    const checks  = await db.getCalibrationChecksForVisit(visitId);
    res.json(checks);
  } catch (err) {
    next(err);
  }
});

router.post('/visits/:id/calibration-checks', async (req, res, next) => {
  try {
    const visitId = parseInt(req.params.id, 10);
    const {
      station_sensor_id,
      transfer_standard_id,
      parameter,
      calibration_date,
      transfer_std_reading,
      sensor_reading,
      correction_applied,
      offset_applied,
      station_reading_post_cal,
      transfer_std_verification_reading,
      certificate_issued,
      certificate_number,
      remarks,
    } = req.body;

    if (!station_sensor_id)    return res.status(400).json({ error: 'station_sensor_id is required' });
    if (!transfer_standard_id) return res.status(400).json({ error: 'transfer_standard_id is required' });
    if (!parameter)            return res.status(400).json({ error: 'parameter is required' });
    if (!calibration_date)     return res.status(400).json({ error: 'calibration_date is required' });
    if (!VALID_PARAMETERS.has(parameter)) {
      return res.status(400).json({ error: 'parameter must be temperature, humidity, or pressure' });
    }

    const sensorParams = await db.getSensorParametersForCalibration(parseInt(station_sensor_id, 10));
    const tolerance    = sensorParams?.[parameter]?.tolerance ?? null;

    const tReading = transfer_std_reading != null ? Number(transfer_std_reading) : null;
    const sReading = sensor_reading        != null ? Number(sensor_reading)        : null;

    const asFoundError     = (tReading != null && sReading != null) ? tReading - sReading : null;
    const withinTolerance  = (asFoundError != null && tolerance != null)
      ? Math.abs(asFoundError) <= tolerance
      : null;

    const postCalReading   = station_reading_post_cal           != null ? Number(station_reading_post_cal)           : null;
    const verifyReading    = transfer_std_verification_reading  != null ? Number(transfer_std_verification_reading)  : null;

    const asLeftError              = (verifyReading != null && postCalReading != null) ? verifyReading - postCalReading : null;
    const postCalWithinTolerance   = (asLeftError != null && tolerance != null)
      ? Math.abs(asLeftError) <= tolerance
      : null;

    const check = await db.createCalibrationCheck({
      visitId,
      stationSensorId:              parseInt(station_sensor_id, 10),
      transferStandardId:           parseInt(transfer_standard_id, 10),
      parameter,
      calibrationDate:              calibration_date,
      calibrationMethod:            'Field verification',
      transferStdReading:           tReading,
      sensorReading:                sReading,
      asFoundError,
      withinTolerance,
      correctionApplied:            correction_applied ?? false,
      offsetApplied:                offset_applied ?? null,
      stationReadingPostCal:        postCalReading,
      transferStdVerificationReading: verifyReading,
      asLeftError,
      postCalWithinTolerance,
      certificateIssued:            certificate_issued ?? null,
      certificateNumber:            certificate_number ?? null,
      technicianId:                 req.user.id,
      remarks:                      remarks ?? null,
    });

    res.status(201).json(check);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
