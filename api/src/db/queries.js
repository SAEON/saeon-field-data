const pool = require('./pool');

// =============================================================
// STATIONS
// =============================================================

async function getAllStations() {
  const result = await pool.query(`
    SELECT id, name, display_name, data_family, region
    FROM   stations
    WHERE  active = true
    ORDER  BY name
  `);
  return result.rows;
}

async function getStationById(id) {
  const result = await pool.query(
    `SELECT * FROM stations WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getStationStreams(stationId) {
  const result = await pool.query(
    `SELECT id, stream_name, record_interval_type, record_interval, logger_type
     FROM   station_data_streams
     WHERE  station_id = $1
     ORDER  BY stream_name`,
    [stationId]
  );
  return result.rows;
}

async function getStationLastVisit(stationId) {
  const result = await pool.query(
    `SELECT fv.id, fv.visited_at, fv.status, u.full_name AS technician_name
     FROM   field_visits fv
     JOIN   users u ON u.id = fv.technician_id
     WHERE  fv.station_id = $1
     ORDER  BY fv.visited_at DESC
     LIMIT  1`,
    [stationId]
  );
  return result.rows[0] || null;
}

async function getAllStationsWithLastVisit(assignedToUserId = null) {
  const params = [];
  let assignmentClause = '';
  if (assignedToUserId) {
    params.push(assignedToUserId);
    assignmentClause = `AND s.assigned_technician_id = $${params.length}`;
  }
  const result = await pool.query(`
    SELECT s.id, s.name, s.display_name, s.data_family, s.region,
           s.active, s.visit_frequency_days, s.assigned_technician_id,
           u.full_name AS assigned_technician_name,
           ST_Y(s.location::geometry) AS latitude,
           ST_X(s.location::geometry) AS longitude,
           MAX(fv.visited_at) AS last_visited_at
    FROM   stations s
    LEFT JOIN users u        ON u.id  = s.assigned_technician_id
    LEFT JOIN field_visits fv ON fv.station_id = s.id
    WHERE  s.active = true ${assignmentClause}
    GROUP  BY s.id, u.full_name
    ORDER  BY s.name
  `, params);
  return result.rows;
}

// Registry view for Sue — includes inactive stations
async function getAllStationsRegistry() {
  const result = await pool.query(`
    SELECT s.id, s.name, s.display_name, s.data_family, s.region,
           s.active, s.visit_frequency_days, s.assigned_technician_id,
           u.full_name AS assigned_technician_name,
           s.elevation_m, s.notes,
           ST_Y(s.location::geometry) AS latitude,
           ST_X(s.location::geometry) AS longitude,
           MAX(fv.visited_at) AS last_visited_at
    FROM   stations s
    LEFT JOIN users u         ON u.id  = s.assigned_technician_id
    LEFT JOIN field_visits fv ON fv.station_id = s.id
    GROUP  BY s.id, u.full_name
    ORDER  BY s.active DESC, s.name
  `);
  return result.rows;
}

async function createStation({ name, displayName, dataFamily, region, latitude, longitude, elevationM, notes, visitFrequencyDays, assignedTechnicianId }) {
  const result = await pool.query(
    `INSERT INTO stations
       (name, display_name, data_family, region, location, elevation_m, notes, visit_frequency_days, assigned_technician_id)
     VALUES ($1, $2, $3, $4,
       CASE WHEN $5::numeric IS NOT NULL AND $6::numeric IS NOT NULL
            THEN ST_MakePoint($6, $5)::geography ELSE NULL END,
       $7, $8, COALESCE($9, 30), $10)
     RETURNING *`,
    [name, displayName, dataFamily, region ?? null,
     latitude ?? null, longitude ?? null,
     elevationM ?? null, notes ?? null,
     visitFrequencyDays ?? null, assignedTechnicianId ?? null]
  );
  return result.rows[0];
}

async function updateStation(id, fields) {
  const {
    name, displayName, dataFamily, region,
    latitude, longitude, elevationM, notes,
    visitFrequencyDays, assignedTechnicianId, active,
  } = fields;

  const sets = [];
  const vals = [id];
  let i = 2;

  if (name              !== undefined) { sets.push(`name = $${i++}`);                   vals.push(name); }
  if (displayName       !== undefined) { sets.push(`display_name = $${i++}`);            vals.push(displayName); }
  if (dataFamily        !== undefined) { sets.push(`data_family = $${i++}`);             vals.push(dataFamily); }
  if (region            !== undefined) { sets.push(`region = $${i++}`);                  vals.push(region); }
  if (elevationM        !== undefined) { sets.push(`elevation_m = $${i++}`);             vals.push(elevationM); }
  if (notes             !== undefined) { sets.push(`notes = $${i++}`);                   vals.push(notes); }
  if (visitFrequencyDays !== undefined){ sets.push(`visit_frequency_days = $${i++}`);    vals.push(visitFrequencyDays); }
  if (assignedTechnicianId !== undefined){ sets.push(`assigned_technician_id = $${i++}`); vals.push(assignedTechnicianId); }
  if (active            !== undefined) { sets.push(`active = $${i++}`);                  vals.push(active); }

  if (latitude !== undefined && longitude !== undefined) {
    sets.push(`location = ST_MakePoint($${i}, $${i + 1})::geography`);
    vals.push(longitude, latitude);
    i += 2;
  }

  if (sets.length === 0) return null;

  const result = await pool.query(
    `UPDATE stations SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    vals
  );
  return result.rows[0] || null;
}

async function deactivateStation(id) {
  await pool.query(`UPDATE stations SET active = false WHERE id = $1`, [id]);
}


// =============================================================
// FIELD VISITS
// =============================================================

async function createFieldVisit({ stationId, technicianId, visitedAt, notes, status }) {
  const result = await pool.query(
    `INSERT INTO field_visits (station_id, technician_id, visited_at, notes, status)
     VALUES ($1, $2, COALESCE($3, NOW()), $4, COALESCE($5, 'draft'))
     RETURNING *`,
    [stationId, technicianId, visitedAt || null, notes || null, status || null]
  );
  return result.rows[0];
}

async function updateVisitDetails(id, { visitedAt, notes }) {
  const result = await pool.query(
    `UPDATE field_visits
     SET visited_at = COALESCE($2, visited_at),
         notes      = $3
     WHERE id = $1
     RETURNING *`,
    [id, visitedAt || null, notes ?? null]
  );
  return result.rows[0] || null;
}

async function getAllVisits({ stationId, status, technicianId } = {}) {
  const params = [];
  const clauses = [];
  if (stationId)    { params.push(stationId);    clauses.push(`fv.station_id = $${params.length}`); }
  if (status)       { params.push(status);       clauses.push(`fv.status = $${params.length}`); }
  if (technicianId) { params.push(technicianId); clauses.push(`fv.technician_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT fv.id, fv.visited_at, fv.submitted_at, fv.status, fv.notes,
            fv.assigned_technician_id,
            s.id AS station_id, s.display_name AS station_display_name, s.data_family,
            u.id  AS technician_id,          u.full_name  AS technician_name,
            au.id AS assigned_technician_id, au.full_name AS assigned_technician_name,
            (SELECT COUNT(*) FROM uploaded_files  uf WHERE uf.visit_id = fv.id)::int  AS file_count,
            (SELECT COUNT(*) FROM uploaded_files  uf WHERE uf.visit_id = fv.id AND uf.parse_status = 'error')::int AS file_error_count,
            (SELECT COUNT(*) FROM uploaded_files  uf WHERE uf.visit_id = fv.id AND uf.has_gap = true)::int         AS file_gap_count,
            (SELECT COUNT(*) FROM manual_readings mr WHERE mr.visit_id = fv.id)::int  AS reading_count,
            (SELECT mr.value_text FROM manual_readings mr WHERE mr.visit_id = fv.id AND mr.reading_type = 'overall_site_condition' LIMIT 1) AS site_condition
     FROM   field_visits fv
     JOIN   stations s  ON s.id  = fv.station_id
     JOIN   users    u  ON u.id  = fv.technician_id
     LEFT JOIN users au ON au.id = fv.assigned_technician_id
     ${where}
     ORDER  BY fv.visited_at DESC
     LIMIT  100`,
    params
  );
  return result.rows;
}

async function getVisitById(id) {
  const result = await pool.query(
    `SELECT fv.id, fv.visited_at, fv.submitted_at, fv.status, fv.notes,
            s.id AS station_id, s.display_name AS station_display_name, s.data_family,
            u.id AS technician_id, u.full_name AS technician_name
     FROM   field_visits fv
     JOIN   stations s ON s.id = fv.station_id
     JOIN   users    u ON u.id = fv.technician_id
     WHERE  fv.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getVisitFiles(visitId) {
  const result = await pool.query(
    `SELECT id, original_name, file_format, parse_status,
            date_range_start, date_range_end, record_count,
            has_gap, gap_days, stream_name, uploaded_at
     FROM   uploaded_files
     WHERE  visit_id = $1
     ORDER  BY uploaded_at`,
    [visitId]
  );
  return result.rows;
}

async function getVisitReadings(visitId) {
  const result = await pool.query(
    `SELECT id, reading_type, value_numeric, value_text, unit, recorded_at, notes
     FROM   manual_readings
     WHERE  visit_id = $1
     ORDER  BY recorded_at`,
    [visitId]
  );
  return result.rows;
}

async function updateVisitStatus(id, status) {
  const result = await pool.query(
    `UPDATE field_visits
     SET status = $2,
         submitted_at = CASE WHEN $2 = 'submitted' THEN NOW() ELSE submitted_at END
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  return result.rows[0] || null;
}


// =============================================================
// UPLOADED FILES
// =============================================================

async function getFileByHash(fileHash) {
  const result = await pool.query(
    `SELECT * FROM uploaded_files WHERE file_hash = $1`,
    [fileHash]
  );
  return result.rows[0] || null;
}

async function getFileByHashAndVisit(fileHash, visitId) {
  const result = await pool.query(
    `SELECT * FROM uploaded_files WHERE file_hash = $1 AND visit_id = $2`,
    [fileHash, visitId]
  );
  return result.rows[0] || null;
}

async function createUploadedFile({ visitId, originalName, fileHash, fileSizeBytes, storagePath, fileFormat }) {
  const result = await pool.query(
    `INSERT INTO uploaded_files
       (visit_id, original_name, file_hash, file_size_bytes, storage_path, file_format)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [visitId, originalName, fileHash, fileSizeBytes, storagePath, fileFormat]
  );
  return result.rows[0];
}

async function updateFileParsed(id, { dateRangeStart, dateRangeEnd, recordCount, streamName }) {
  const result = await pool.query(
    `UPDATE uploaded_files
     SET    parse_status     = 'parsed',
            date_range_start = $2,
            date_range_end   = $3,
            record_count     = $4,
            stream_name      = $5
     WHERE  id = $1
     RETURNING *`,
    [id, dateRangeStart, dateRangeEnd, recordCount, streamName ?? null]
  );
  return result.rows[0] || null;
}

async function updateFileParseError(id, errorMessage) {
  const result = await pool.query(
    `UPDATE uploaded_files
     SET    parse_status = 'error',
            parse_error  = $2
     WHERE  id = $1
     RETURNING *`,
    [id, errorMessage]
  );
  return result.rows[0] || null;
}

async function getPriorCoverageEnd(stationId, streamName, excludeFileId) {
  const result = await pool.query(
    `SELECT MAX(uf.date_range_end) AS prior_end
     FROM   uploaded_files uf
     JOIN   field_visits   fv ON fv.id = uf.visit_id
     WHERE  fv.station_id   = $1
       AND  uf.stream_name  = $2
       AND  uf.parse_status = 'parsed'
       AND  uf.id          != $3`,
    [stationId, streamName, excludeFileId]
  );
  return result.rows[0]?.prior_end ?? null;
}

async function markFileGap(fileId, gapDays) {
  const result = await pool.query(
    `UPDATE uploaded_files
     SET    has_gap  = true,
            gap_days = $2
     WHERE  id = $1
     RETURNING id, has_gap, gap_days`,
    [fileId, gapDays]
  );
  return result.rows[0] || null;
}

async function clearFileGap(fileId) {
  await pool.query(
    `UPDATE uploaded_files SET has_gap = false, gap_days = NULL WHERE id = $1`,
    [fileId]
  );
}

async function getFilesWithGaps() {
  const result = await pool.query(
    `SELECT uf.id, uf.original_name, uf.stream_name, uf.gap_days,
            uf.date_range_start, uf.date_range_end, uf.uploaded_at,
            s.display_name AS station_name,
            u.full_name    AS technician_name,
            fv.visited_at
     FROM   uploaded_files uf
     JOIN   field_visits   fv ON fv.id = uf.visit_id
     JOIN   stations        s  ON s.id  = fv.station_id
     JOIN   users           u  ON u.id  = fv.technician_id
     WHERE  uf.has_gap = true
     ORDER  BY uf.gap_days DESC NULLS LAST, uf.uploaded_at DESC`
  );
  return result.rows;
}

async function resetFileToPending(id) {
  const result = await pool.query(
    `UPDATE uploaded_files
     SET    parse_status = 'pending',
            parse_error  = NULL
     WHERE  id = $1
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

async function getFileById(id) {
  const result = await pool.query(
    `SELECT * FROM uploaded_files WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getUnparsedFiles() {
  const result = await pool.query(
    `SELECT * FROM uploaded_files WHERE parse_status = 'pending' ORDER BY uploaded_at`
  );
  return result.rows;
}

async function deleteMeasurementsByFile(fileId) {
  await pool.query(`DELETE FROM raw_measurements WHERE file_id = $1`, [fileId]);
}

async function deleteUploadedFile(id) {
  const result = await pool.query(
    `DELETE FROM uploaded_files WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}


// =============================================================
// MANUAL READINGS
// =============================================================

async function createManualReading({ visitId, readingType, valueNumeric, valueText, unit, recordedAt, notes }) {
  const result = await pool.query(
    `INSERT INTO manual_readings
       (visit_id, reading_type, value_numeric, value_text, unit, recorded_at, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (visit_id, reading_type) DO UPDATE SET
       value_numeric = EXCLUDED.value_numeric,
       value_text    = EXCLUDED.value_text,
       unit          = EXCLUDED.unit,
       recorded_at   = EXCLUDED.recorded_at,
       notes         = EXCLUDED.notes
     RETURNING *`,
    [visitId, readingType, valueNumeric || null, valueText || null, unit || null, recordedAt, notes || null]
  );
  return result.rows[0];
}

async function getReadingsByVisit(visitId) {
  return getVisitReadings(visitId);
}


// =============================================================
// RAW MEASUREMENTS
// =============================================================

// measurements: [{ streamId, phenomenonId, measuredAt, valueNumeric, valueText, isInterference }]
// Uses PostgreSQL unnest() — 7 typed array params regardless of row count.
// Far more efficient than VALUES ($1,$2,...) for large batches.
async function bulkInsertMeasurements(fileId, measurements) {
  if (!measurements.length) return;

  const fileIds    = measurements.map(() => fileId);
  const streamIds  = measurements.map(m => m.streamId);
  const phenIds    = measurements.map(m => m.phenomenonId);
  const timestamps = measurements.map(m => m.measuredAt);
  const numerics   = measurements.map(m => m.valueNumeric  ?? null);
  const texts      = measurements.map(m => m.valueText      ?? null);
  const interfs    = measurements.map(m => m.isInterference ?? false);

  await pool.query(
    `INSERT INTO raw_measurements
       (file_id, stream_id, phenomenon_id, measured_at, value_numeric, value_text, is_interference)
     SELECT * FROM unnest(
       $1::int[], $2::int[], $3::int[], $4::timestamptz[],
       $5::numeric[], $6::text[], $7::bool[]
     )
     ON CONFLICT (stream_id, phenomenon_id, measured_at) DO NOTHING`,
    [fileIds, streamIds, phenIds, timestamps, numerics, texts, interfs]
  );
}

// stub — used in Phase 2
async function getMeasurementsByStream(streamId, from, to, limit = 10000) {
  const result = await pool.query(
    `SELECT rm.measured_at, rm.value_numeric, rm.value_text, rm.is_interference,
            p.name AS phenomenon_name, p.unit
     FROM   raw_measurements rm
     JOIN   phenomena p ON p.id = rm.phenomenon_id
     WHERE  rm.stream_id = $1
       AND  rm.measured_at BETWEEN $2 AND $3
       AND  rm.is_interference = false
     ORDER  BY rm.measured_at
     LIMIT  $4`,
    [streamId, from, to, limit]
  );
  return result.rows;
}

async function getMeasurementCount(fileId) {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count FROM raw_measurements WHERE file_id = $1`,
    [fileId]
  );
  return result.rows[0].count;
}


// =============================================================
// RAINFALL PROCESSING
// =============================================================

// Raw rainfall tips for a station — sorted by time, with current flag
async function getRawTipsForStation(stationId) {
  const result = await pool.query(
    `SELECT rm.id, rm.stream_id, rm.measured_at, rm.qa_flag
     FROM   raw_measurements rm
     JOIN   station_data_streams sds ON sds.id = rm.stream_id
     JOIN   phenomena p ON p.id = rm.phenomenon_id
     WHERE  sds.station_id = $1
       AND  p.name = 'rain_tip'
       AND  rm.is_interference = false
     ORDER  BY rm.measured_at`,
    [stationId]
  );
  return result.rows;
}

// Visit timestamps for a station — used for ±600s interfere window
async function getVisitTimestampsForStation(stationId) {
  const result = await pool.query(
    `SELECT visited_at
     FROM   field_visits
     WHERE  station_id = $1
       AND  status IN ('pending', 'complete', 'flagged')
     ORDER  BY visited_at`,
    [stationId]
  );
  return result.rows.map(r => new Date(r.visited_at));
}

// Pseudo-event windows from manual_readings (event_start_dt + event_end_dt pairs)
async function getPseudoEventWindows(stationId) {
  const result = await pool.query(
    `SELECT
       MAX(CASE WHEN mr.reading_type = 'event_start_dt' THEN mr.value_text END) AS start_dt,
       MAX(CASE WHEN mr.reading_type = 'event_end_dt'   THEN mr.value_text END) AS end_dt
     FROM   field_visits fv
     JOIN   manual_readings mr ON mr.visit_id = fv.id
     WHERE  fv.station_id = $1
       AND  fv.status IN ('pending', 'complete', 'flagged')
       AND  mr.reading_type IN ('event_start_dt', 'event_end_dt')
     GROUP  BY fv.id
     HAVING MAX(CASE WHEN mr.reading_type = 'event_start_dt' THEN mr.value_text END) IS NOT NULL
        AND MAX(CASE WHEN mr.reading_type = 'event_end_dt'   THEN mr.value_text END) IS NOT NULL`,
    [stationId]
  );
  return result.rows.map(r => ({ start: new Date(r.start_dt), end: new Date(r.end_dt) }));
}

// Bulk-update flag on raw_measurements — only changed rows are passed in
async function bulkUpdateFlags(updates) {
  if (!updates.length) return;
  const ids   = updates.map(u => u.id);
  const flags = updates.map(u => u.flag); // null = valid (clears old flag)
  await pool.query(
    `UPDATE raw_measurements rm
     SET    qa_flag = u.flag
     FROM   unnest($1::bigint[], $2::text[]) AS u(id, flag)
     WHERE  rm.id = u.id`,
    [ids, flags]
  );
}

// Upsert 5-min rainfall aggregates — recalculated on every processing run
async function upsertRainfallRows(rows) {
  if (!rows.length) return;
  const stationIds  = rows.map(r => r.stationId);
  const streamIds   = rows.map(r => r.streamId);
  const starts      = rows.map(r => r.periodStart);
  const rainMms     = rows.map(r => r.rainMm);
  const tipCounts   = rows.map(r => r.tipCount);
  const validTipss  = rows.map(r => r.validTips);
  const anomalies   = rows.map(r => r.isAnomaly);

  await pool.query(
    `INSERT INTO rainfall
       (station_id, stream_id, period_start, rain_mm, tip_count, valid_tips, is_anomaly)
     SELECT * FROM unnest(
       $1::int[], $2::int[], $3::timestamptz[],
       $4::numeric[], $5::int[], $6::int[], $7::bool[]
     )
     ON CONFLICT (stream_id, period_start) DO UPDATE SET
       rain_mm      = EXCLUDED.rain_mm,
       tip_count    = EXCLUDED.tip_count,
       valid_tips   = EXCLUDED.valid_tips,
       is_anomaly   = EXCLUDED.is_anomaly,
       processed_at = NOW()`,
    [stationIds, streamIds, starts, rainMms, tipCounts, validTipss, anomalies]
  );
}

// Query rainfall aggregates at any resolution — aggregation happens here at runtime
// resolution: '5min' | 'hourly' | 'daily' | 'monthly' | 'yearly'
async function getRainfallData(stationId, from, to, resolution = 'daily') {
  if (resolution === '5min') {
    const result = await pool.query(
      `SELECT period_start, rain_mm, tip_count, valid_tips, is_anomaly AS has_anomaly
       FROM   rainfall
       WHERE  station_id = $1
         AND  period_start BETWEEN $2 AND $3
       ORDER  BY period_start`,
      [stationId, from, to]
    );
    return result.rows;
  }

  // Validated against fixed map — safe to interpolate into SQL
  const truncMap = {
    hourly:     `DATE_TRUNC('hour',  period_start)`,
    daily:      `DATE_TRUNC('day',   period_start)`,
    saws_daily: `DATE_TRUNC('day',   period_start - INTERVAL '6 hours') + INTERVAL '6 hours'`,
    monthly:    `DATE_TRUNC('month', period_start)`,
    yearly:     `DATE_TRUNC('year',  period_start)`,
  };
  if (!truncMap[resolution]) throw new Error(`Invalid resolution: ${resolution}`);
  const trunc = truncMap[resolution];

  const result = await pool.query(
    `SELECT
       ${trunc}                       AS period_start,
       SUM(rain_mm)::numeric(8,3)     AS rain_mm,
       SUM(tip_count)::integer        AS tip_count,
       SUM(valid_tips)::integer       AS valid_tips,
       BOOL_OR(is_anomaly)            AS has_anomaly
     FROM   rainfall
     WHERE  station_id = $1
       AND  period_start BETWEEN $2 AND $3
     GROUP  BY ${trunc}
     ORDER  BY ${trunc}`,
    [stationId, from, to]
  );
  return result.rows;
}


// =============================================================
// LOOKUPS — PHENOMENA
// =============================================================

async function getPhenomenonByName(name) {
  const result = await pool.query(
    `SELECT * FROM phenomena WHERE name = $1`,
    [name]
  );
  return result.rows[0] || null;
}

// Returns a map keyed by phenomenon name — load once at parser startup
async function getAllPhenomena() {
  const result = await pool.query(`SELECT * FROM phenomena ORDER BY name`);
  const map = {};
  for (const row of result.rows) map[row.name] = row;
  return map;
}


// =============================================================
// LOOKUPS — STREAMS
// =============================================================

async function getOrCreateStream(stationId, streamName) {
  const existing = await pool.query(
    `SELECT id FROM station_data_streams WHERE station_id = $1 AND stream_name = $2`,
    [stationId, streamName]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await pool.query(
    `INSERT INTO station_data_streams (station_id, stream_name, record_interval_type)
     VALUES ($1, $2, 'continuous')
     ON CONFLICT (station_id, stream_name) DO UPDATE SET station_id = EXCLUDED.station_id
     RETURNING id`,
    [stationId, streamName]
  );
  return created.rows[0].id;
}


// =============================================================
// USERS
// =============================================================

async function getUserById(id) {
  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0] || null;
}

// role filter: 'technician' | 'technician_lead' | 'data_manager' | undefined (all)
async function getAllUsers({ role } = {}) {
  const params = [];
  const clauses = ['1=1'];
  if (role) { params.push(role); clauses.push(`role = $${params.length}`); }
  const result = await pool.query(
    `SELECT id, email, full_name, display_name, initials, role, active, last_login, created_at
     FROM   users
     WHERE  ${clauses.join(' AND ')}
     ORDER  BY full_name`,
    params
  );
  return result.rows;
}

async function createUser({ email, fullName, initials, role }) {
  const result = await pool.query(
    `INSERT INTO users (email, full_name, display_name, initials, role, active)
     VALUES ($1, $2, $2, $3, $4, true)
     RETURNING id, email, full_name, display_name, initials, role, active, created_at`,
    [email, fullName, initials, role]
  );
  return result.rows[0];
}

// Only role and active are editable — everything else comes from Keycloak on first login
async function updateUser(id, { role, active }) {
  const sets = [];
  const vals = [id];
  let i = 2;
  if (role   !== undefined) { sets.push(`role = $${i++}`);   vals.push(role); }
  if (active !== undefined) { sets.push(`active = $${i++}`); vals.push(active); }
  if (!sets.length) return null;
  const result = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, email, full_name, display_name, initials, role, active`,
    vals
  );
  return result.rows[0] || null;
}


// =============================================================
// DASHBOARD — Phase 2 prep (stubs)
// =============================================================

// Stations where time since last SUBMITTED visit exceeds their visit_frequency_days.
// Stations never visited are always overdue.
async function getOverdueStations() {
  const result = await pool.query(`
    SELECT s.id, s.name, s.display_name, s.data_family, s.region,
           s.visit_frequency_days,
           s.assigned_technician_id,
           u.full_name AS assigned_technician_name,
           MAX(fv.visited_at) AS last_visited_at,
           EXTRACT(DAY FROM NOW() - MAX(fv.visited_at))::int AS days_since_visit
    FROM   stations s
    LEFT JOIN field_visits fv ON fv.station_id = s.id AND fv.status = 'submitted'
    LEFT JOIN users u ON u.id = s.assigned_technician_id
    WHERE  s.active = true
    GROUP  BY s.id, u.full_name
    HAVING MAX(fv.visited_at) IS NULL
        OR NOW() - MAX(fv.visited_at) > (s.visit_frequency_days * INTERVAL '1 day')
    ORDER  BY days_since_visit DESC NULLS FIRST
  `);
  return result.rows;
}

async function assignVisit(visitId, technicianId) {
  const result = await pool.query(
    `UPDATE field_visits
     SET assigned_technician_id = $2
     WHERE id = $1
     RETURNING *`,
    [visitId, technicianId]
  );
  return result.rows[0] || null;
}

async function getRecentVisitsAllStations(limit = 20) {
  const result = await pool.query(
    `SELECT fv.id, fv.visited_at, fv.status,
            s.display_name AS station_name,
            u.full_name    AS technician_name
     FROM   field_visits fv
     JOIN   stations s ON s.id = fv.station_id
     JOIN   users    u ON u.id = fv.technician_id
     ORDER  BY fv.visited_at DESC
     LIMIT  $1`,
    [limit]
  );
  return result.rows;
}

async function getStationsNotVisitedSince(date) {
  const result = await pool.query(
    `SELECT s.id, s.display_name, s.data_family, s.region,
            MAX(fv.visited_at) AS last_visited
     FROM   stations s
     LEFT JOIN field_visits fv ON fv.station_id = s.id
     WHERE  s.active = true
     GROUP  BY s.id
     HAVING MAX(fv.visited_at) < $1 OR MAX(fv.visited_at) IS NULL
     ORDER  BY last_visited NULLS FIRST`,
    [date]
  );
  return result.rows;
}

async function getGroundwaterStationsMissingDipper() {
  const result = await pool.query(
    `SELECT s.id, s.display_name, fv.id AS visit_id, fv.visited_at
     FROM   stations s
     JOIN   field_visits fv ON fv.station_id = s.id
     WHERE  s.data_family = 'groundwater'
       AND  s.active = true
       AND  fv.visited_at = (
              SELECT MAX(v2.visited_at)
              FROM   field_visits v2
              WHERE  v2.station_id = s.id
            )
       AND  NOT EXISTS (
              SELECT 1 FROM manual_readings mr
              WHERE  mr.visit_id = fv.id
                AND  mr.reading_type = 'dipper_depth'
            )
     ORDER  BY fv.visited_at DESC`
  );
  return result.rows;
}

async function getFilesWithParseErrors() {
  const result = await pool.query(
    `SELECT uf.id, uf.original_name, uf.parse_error, uf.uploaded_at,
            s.display_name AS station_name,
            u.full_name    AS technician_name
     FROM   uploaded_files uf
     JOIN   field_visits fv ON fv.id = uf.visit_id
     JOIN   stations     s  ON s.id  = fv.station_id
     JOIN   users        u  ON u.id  = fv.technician_id
     WHERE  uf.parse_status = 'error'
     ORDER  BY uf.uploaded_at DESC`
  );
  return result.rows;
}

async function getStationDataCoverage(stationId) {
  const result = await pool.query(
    `SELECT sds.stream_name,
            MIN(uf.date_range_start) AS coverage_start,
            MAX(uf.date_range_end)   AS coverage_end,
            COUNT(uf.id)::integer    AS file_count
     FROM   station_data_streams sds
     JOIN   uploaded_files uf ON uf.visit_id IN (
              SELECT id FROM field_visits WHERE station_id = $1
            )
     WHERE  sds.station_id = $1
     GROUP  BY sds.stream_name
     ORDER  BY sds.stream_name`,
    [stationId]
  );
  return result.rows;
}


module.exports = {
  // Stations
  getAllStations,
  getAllStationsWithLastVisit,
  getAllStationsRegistry,
  getStationById,
  getStationStreams,
  getStationLastVisit,
  createStation,
  updateStation,
  deactivateStation,
  // Visits
  createFieldVisit,
  updateVisitDetails,
  getAllVisits,
  getVisitById,
  getVisitFiles,
  getVisitReadings,
  updateVisitStatus,
  // Files
  getFileByHash,
  getFileByHashAndVisit,
  createUploadedFile,
  updateFileParsed,
  updateFileParseError,
  resetFileToPending,
  getPriorCoverageEnd,
  markFileGap,
  clearFileGap,
  getFilesWithGaps,
  getFileById,
  getUnparsedFiles,
  deleteMeasurementsByFile,
  deleteUploadedFile,
  // Readings
  createManualReading,
  getReadingsByVisit,
  // Rainfall processing
  getRawTipsForStation,
  getVisitTimestampsForStation,
  getPseudoEventWindows,
  bulkUpdateFlags,
  upsertRainfallRows,
  getRainfallData,
  // Measurements
  bulkInsertMeasurements,
  getMeasurementsByStream,
  getMeasurementCount,
  // Lookups
  getPhenomenonByName,
  getAllPhenomena,
  getOrCreateStream,
  // Users
  getUserById,
  getUserByEmail,
  getAllUsers,
  createUser,
  updateUser,
  // Dashboard
  getOverdueStations,
  assignVisit,
  getRecentVisitsAllStations,
  getStationsNotVisitedSince,
  getGroundwaterStationsMissingDipper,
  getFilesWithParseErrors,
  getStationDataCoverage,
};
