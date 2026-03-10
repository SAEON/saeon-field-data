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

async function getAllStationsWithLastVisit() {
  const result = await pool.query(`
    SELECT s.id, s.name, s.display_name, s.data_family, s.region,
           MAX(fv.visited_at) AS last_visited_at
    FROM   stations s
    LEFT JOIN field_visits fv ON fv.station_id = s.id
    WHERE  s.active = true
    GROUP  BY s.id
    ORDER  BY s.name
  `);
  return result.rows;
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
            s.id AS station_id, s.display_name AS station_display_name, s.data_family,
            u.id AS technician_id, u.full_name AS technician_name,
            (SELECT COUNT(*) FROM uploaded_files  uf WHERE uf.visit_id = fv.id)::int  AS file_count,
            (SELECT COUNT(*) FROM uploaded_files  uf WHERE uf.visit_id = fv.id AND uf.parse_status = 'error')::int AS file_error_count,
            (SELECT COUNT(*) FROM manual_readings mr WHERE mr.visit_id = fv.id)::int  AS reading_count,
            (SELECT mr.value_text FROM manual_readings mr WHERE mr.visit_id = fv.id AND mr.reading_type = 'overall_site_condition' LIMIT 1) AS site_condition
     FROM   field_visits fv
     JOIN   stations s ON s.id = fv.station_id
     JOIN   users    u ON u.id = fv.technician_id
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
            date_range_start, date_range_end, record_count, uploaded_at
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
  const submitted_at = status === 'submitted' ? new Date() : null;
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

async function updateFileParsed(id, { dateRangeStart, dateRangeEnd, recordCount }) {
  const result = await pool.query(
    `UPDATE uploaded_files
     SET    parse_status = 'parsed',
            date_range_start = $2,
            date_range_end   = $3,
            record_count     = $4
     WHERE  id = $1
     RETURNING *`,
    [id, dateRangeStart, dateRangeEnd, recordCount]
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
// USERS — Phase 2 prep (stubs)
// =============================================================

async function getUserById(id) {
  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0] || null;
}


// =============================================================
// DASHBOARD — Phase 2 prep (stubs)
// =============================================================

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
  getStationById,
  getStationStreams,
  getStationLastVisit,
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
  getFileById,
  getUnparsedFiles,
  deleteMeasurementsByFile,
  deleteUploadedFile,
  // Readings
  createManualReading,
  getReadingsByVisit,
  // Measurements
  bulkInsertMeasurements,
  getMeasurementsByStream,
  getMeasurementCount,
  // Lookups
  getPhenomenonByName,
  getAllPhenomena,
  getOrCreateStream,
  // Users (Phase 2 prep)
  getUserById,
  getUserByEmail,
  // Dashboard (Phase 2 prep)
  getRecentVisitsAllStations,
  getStationsNotVisitedSince,
  getGroundwaterStationsMissingDipper,
  getFilesWithParseErrors,
  getStationDataCoverage,
};
