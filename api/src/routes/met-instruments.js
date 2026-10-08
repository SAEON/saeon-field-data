const express = require('express');
const fs      = require('fs');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseInBackground } = require('./files');

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

router.get('/stations/:id/met', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const { from, to, category = 'temperature', resolution = 'hour' } = req.query;

    const CATEGORY_PHENOMENA = {
      temperature:  ['temp_air_avg', 'temp_air_min', 'temp_air_max', 'humid_rel_avg', 'temp_dew_avg', 'temp_ground_min'],
      wind:         ['wind_speed_avg', 'wind_dir_avg', 'wind_dir_sd'],
      radiation:    ['rad_solar_avg'],
      uv:           ['rad_uv_avg'],
      pressure:     ['pressure_atm_avg', 'pressure_vpd_avg'],
      rainfall:     ['rain_tot'],
      soil_temp:    ['temp_soil_avg'],
      leaf_wetness: ['leaf_wet_avg'],
      soil_moisture:['moisture_soil_avg'],
      evapo:        ['et_ref_tot'],
    };

    const phenomena = CATEGORY_PHENOMENA[category];
    if (!phenomena) return res.status(400).json({ error: 'Invalid category' });

    const VALID_RES = ['raw', 'hour', 'day'];
    if (!VALID_RES.includes(resolution)) return res.status(400).json({ error: 'Invalid resolution' });

    const fromDate = from || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const toDate   = to   || new Date().toISOString();

    const rows = await db.getMetData(stationId, { from: fromDate, to: toDate, phenomena, resolution });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/stations/:id/calibration-history', async (req, res, next) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const history   = await db.getCalibrationHistoryForStation(stationId);
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

router.get('/phenomena', async (req, res, next) => {
  try {
    const phenMap = await db.getAllPhenomena();
    res.json(Object.values(phenMap).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (err) { next(err); }
});

router.post('/phenomena', async (req, res, next) => {
  try {
    if (!['data_manager', 'technician_lead'].includes(req.user?.roles?.[0]))
      return res.status(403).json({ error: 'Forbidden' });
    const { name, display_name, data_family, unit, measure, var_type, phen_type } = req.body;
    if (!name || !display_name || !data_family || !unit || !measure || !var_type)
      return res.status(400).json({ error: 'name, display_name, data_family, unit, measure, var_type are required' });
    const VALID = {
      data_family: ['met', 'groundwater', 'rainfall', 'all'],
      measure:     ['avg', 'cumm', 'event', 'logi', 'max', 'min', 'mode', 'sd', 'smp', 'text', 'tot'],
      var_type:    ['chr', 'difftime', 'fac', 'int', 'logi', 'num', 'posix', 'text'],
    };
    for (const [field, allowed] of Object.entries(VALID)) {
      if (!allowed.includes(req.body[field]))
        return res.status(400).json({ error: `Invalid ${field}` });
    }
    const row = await db.createPhenomenon({
      name, displayName: display_name, dataFamily: data_family,
      unit, measure, varType: var_type, phenType: phen_type ?? null,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A phenomenon with that name already exists' });
    next(err);
  }
});

router.patch('/phenomena/:id', requireRole('data_manager'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { display_name, phen_type, data_family, unit, measure, var_type } = req.body;
    if (!display_name || !data_family || !unit || !measure || !var_type)
      return res.status(400).json({ error: 'display_name, data_family, unit, measure, var_type are required' });
    const VALID = {
      data_family: ['met', 'groundwater', 'rainfall', 'all'],
      measure:     ['avg', 'cumm', 'event', 'logi', 'max', 'min', 'mode', 'sd', 'smp', 'text', 'tot'],
      var_type:    ['chr', 'difftime', 'fac', 'int', 'logi', 'num', 'posix', 'text'],
    };
    for (const [field, allowed] of Object.entries(VALID)) {
      if (!allowed.includes(req.body[field]))
        return res.status(400).json({ error: `Invalid ${field}` });
    }
    const row = await db.updatePhenomenon(id, {
      displayName: display_name, phenType: phen_type ?? null,
      dataFamily: data_family, unit, measure, varType: var_type,
    });
    if (!row) return res.status(404).json({ error: 'Phenomenon not found' });
    res.json(row);
  } catch (err) { next(err); }
});

router.get('/column-mappings/pending', async (req, res, next) => {
  try {
    const rows = await db.getPendingColumnMappings();
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/column-mappings/:id/resolve', async (req, res, next) => {
  try {
    const id          = parseInt(req.params.id, 10);
    const { phenomenon_id } = req.body;
    if (!phenomenon_id) return res.status(400).json({ error: 'phenomenon_id required' });
    const row = await db.resolveColumnMapping(id, { phenomenonId: phenomenon_id, resolvedBy: req.user?.id });
    if (!row) return res.status(404).json({ error: 'Mapping not found' });

    // Reparse all files in the data_family that still have unmapped columns — not just source_file_id.
    // This clears has_unmapped_columns on every file that benefits from the new mapping.
    let filesQueued = 0;
    if (row.data_family) {
      const flagged  = await db.getFlaggedFilesForDataFamily(row.data_family);
      const reachable = flagged.filter(f => f.storage_path && fs.existsSync(f.storage_path));
      for (const f of reachable) await db.resetFileToPending(f.id);
      filesQueued = reachable.length;
      for (const f of reachable) setImmediate(() => parseInBackground(f, f.visit_id));
    } else if (row.source_file_id) {
      const fileRecord = await db.getFileById(row.source_file_id);
      if (fileRecord && fileRecord.storage_path && fs.existsSync(fileRecord.storage_path)) {
        await db.resetFileToPending(fileRecord.id);
        filesQueued = 1;
        setImmediate(() => parseInBackground(fileRecord, fileRecord.visit_id));
      }
    }

    res.json({ ...row, files_queued: filesQueued });
  } catch (err) { next(err); }
});

router.post('/column-mappings/:id/ignore', async (req, res, next) => {
  try {
    const id  = parseInt(req.params.id, 10);
    const row = await db.ignoreColumnMapping(id, req.user?.id);
    if (!row) return res.status(404).json({ error: 'Mapping not found' });
    res.json(row);
  } catch (err) { next(err); }
});

router.patch('/column-mappings/:id/reassign', requireRole('data_manager'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { phenomenon_id } = req.body;
    if (!phenomenon_id) return res.status(400).json({ error: 'phenomenon_id required' });

    const row = await db.resolveColumnMapping(id, { phenomenonId: phenomenon_id, resolvedBy: req.user?.id });
    if (!row) return res.status(404).json({ error: 'Mapping not found' });

    let filesQueued = 0;

    if (row.data_family) {
      const files     = await db.getParsedFilesForDataFamily(row.data_family);
      const reachable = files.filter(f => f.storage_path && fs.existsSync(f.storage_path));
      for (const f of reachable) {
        await db.resetFileToPending(f.id);
      }
      filesQueued = reachable.length;
      for (const f of reachable) {
        setImmediate(() => parseInBackground(f, f.visit_id));
      }
    } else if (row.source_file_id) {
      const fileRecord = await db.getFileById(row.source_file_id);
      if (fileRecord && fileRecord.storage_path && fs.existsSync(fileRecord.storage_path)) {
        await db.resetFileToPending(fileRecord.id);
        filesQueued = 1;
        setImmediate(() => parseInBackground(fileRecord, fileRecord.visit_id));
      }
    }

    res.json({ ...row, files_queued: filesQueued });
  } catch (err) { next(err); }
});

router.get('/column-mappings/active', async (req, res, next) => {
  try {
    const rows = await db.getAllActiveMappings();
    res.json(rows);
  } catch (err) { next(err); }
});

router.patch('/column-mappings/:id/nodes', async (req, res, next) => {
  try {
    const id   = parseInt(req.params.id, 10);
    const { arid = false, efteon = false, fynbos = false, gfw = false, ndlovu = false } = req.body;
    const row  = await db.updateColumnMappingNodes(id, { arid, efteon, fynbos, gfw, ndlovu });
    if (!row) return res.status(404).json({ error: 'Mapping not found' });
    res.json(row);
  } catch (err) { next(err); }
});

module.exports = router;
