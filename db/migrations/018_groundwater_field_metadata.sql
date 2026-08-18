-- Schema additions derived from ipayipi R pipeline field log analysis
-- (datum_log.csv = borehole survey data; retrieve_log.csv = field visit log).
--
-- Architecture:
--   One-off borehole properties  → stations columns
--   Per-visit observations       → manual_readings rows (reading_type key)
--   Per-deployment logger config → instrument_history column
--   Visit classifier             → field_visits column
--   Typo fix                     → uploaded_files constraint

-- ── A. stations — one-off borehole survey metadata ───────────────────────────
-- elevation_m (= H_masl, casing-top elevation above sea level) already exists.
-- casing_ht_m already added in migration 017.

ALTER TABLE stations
  ADD COLUMN well_depth_m  NUMERIC,      -- total borehole depth (datum_log.Well_depth_m)
  ADD COLUMN survey_method TEXT,         -- how H_masl was measured (GPS-SRTM, DWAS survey…)
  ADD COLUMN surveyed_at   TIMESTAMPTZ;  -- when the H_masl datum survey was done

-- ── B. field_visits — visit classifier ───────────────────────────────────────
-- Per-visit observations (equipment condition, download status, dipper, etc.)
-- are stored as manual_readings rows, not as columns here.

ALTER TABLE field_visits
  ADD COLUMN visit_type TEXT CHECK (visit_type IN (
    'logger_download', 'borehole_readings', 'logger_deploy', 'maintenance', 'description'
  ));

-- ── C. instrument_history — logger deployment config ─────────────────────────
-- Sampling interval is set when the logger is programmed at deployment.
-- 3600 = hourly, 1800 = 30 min, 900 = 15 min.

ALTER TABLE instrument_history
  ADD COLUMN log_interval_s INTEGER;

-- ── D. manual_readings — per-visit recorder tracking ─────────────────────────
-- Dipper readings are sometimes taken by a different person than the visit recorder.
-- Standardised reading_type values for groundwater visits:
--   dipper_depth            value_numeric (m)
--   casing_ht_verification  value_numeric (m)   per-visit QA check of fixed casing_ht_m
--   depth_to_logger         value_numeric (m)
--   equipment_condition     value_text ('good'/'problem')
--   logger_stopped          value_text ('yes'/'no')
--   logger_time_synced      value_text ('yes'/'no')
--   download_ok             value_text ('yes'/'no')

ALTER TABLE manual_readings
  ADD COLUMN recorder_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── E. uploaded_files — fix file_format constraint typo ──────────────────────
-- Parser was renamed solonist → solinst; the constraint was not updated.

UPDATE uploaded_files SET file_format = 'solinst_xle' WHERE file_format = 'solonist_xle';

ALTER TABLE uploaded_files DROP CONSTRAINT uploaded_files_file_format_check;

ALTER TABLE uploaded_files ADD CONSTRAINT uploaded_files_file_format_check
  CHECK (file_format IN (
    'hobo_csv', 'solinst_xle', 'campbell_toa5',
    'generic_csv', 'saeon_stom', 'hobo_binary'
  ));
