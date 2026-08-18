-- Schema additions derived from ipayipi R pipeline field log analysis
-- (datum_log.csv = borehole survey data; retrieve_log.csv = field visit log)
-- and Michele's Google Sheet metadata (all tabs reviewed 2026-08-18).
--
-- Architecture:
--   One-off borehole properties  → stations columns
--   Per-visit observations       → manual_readings rows (reading_type key)
--   Per-deployment logger config → instrument_history column
--   Visit classifier             → field_visits column
--   Typo fix                     → uploaded_files constraint
--   New logger type              → instrument_history instrument_type constraint

-- ── A. stations — one-off borehole survey metadata ───────────────────────────
-- elevation_m (= H_masl, casing-top elevation above sea level) already exists.
-- casing_ht_m already added in migration 017.

ALTER TABLE stations
  ADD COLUMN well_depth_m          NUMERIC,   -- total borehole depth (datum_log.Well_depth_m)
  ADD COLUMN survey_method         TEXT,      -- how H_masl was measured (GPS-SRTM, DWAS survey…)
  ADD COLUMN surveyed_at           TIMESTAMPTZ,  -- when the H_masl datum survey was done
  ADD COLUMN casing_reference_mark TEXT,      -- physical description of datum mark for dipper placement
  ADD COLUMN external_codes        JSONB;     -- external reference IDs: nga, schapers_m, dws_survey, code, synonyms

-- ── B. field_visits — visit classifier ───────────────────────────────────────
-- Per-visit observations (equipment condition, download status, dipper, etc.)
-- are stored as manual_readings rows, not as columns here.
-- visit_type values from Michele's official event type definitions (eID 1–6).

ALTER TABLE field_visits
  ADD COLUMN visit_type TEXT CHECK (visit_type IN (
    'logger_download',
    'borehole_readings',
    'logger_deploy',
    'borehole_maintenance',
    'logger_maintenance',
    'borehole_description'
  ));

-- ── C. instrument_history — logger deployment config and new type ─────────────
-- Sampling interval is set when the logger is programmed at deployment.
-- 3600 = hourly, 1800 = 30 min, 900 = 15 min.

ALTER TABLE instrument_history
  ADD COLUMN log_interval_s INTEGER;

-- Add conductivity_logger type (stations with _cdt suffix in stnd_title naming convention).
ALTER TABLE instrument_history DROP CONSTRAINT instrument_history_instrument_type_check;
ALTER TABLE instrument_history ADD CONSTRAINT instrument_history_instrument_type_check
  CHECK (instrument_type IN (
    'raingauge', 'datalogger', 'pressure_transducer', 'barologger', 'conductivity_logger'
  ));

-- ── D. manual_readings — per-visit recorder tracking ─────────────────────────
-- Dipper readings are sometimes taken by a different person than the visit recorder
-- (event_data.dipper_reading_recorder ≠ event_data.recorder).
-- Standardised reading_type values for groundwater borehole_readings visits:
--   dipper_depth            value_numeric (m)   — event_data.dipper_reading_m
--   casing_ht_verification  value_numeric (m)   — event_data.casing_ht_m (per-visit QA check)
--   depth_to_logger         value_numeric (m)   — event_data.depth_to_logger_m
--   equipment_condition     value_text           — event_data.equipment_condition

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
