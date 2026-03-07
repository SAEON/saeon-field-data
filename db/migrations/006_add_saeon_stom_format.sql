-- =============================================================
-- 006_add_saeon_stom_format.sql
-- Adds 'saeon_stom' as a valid file_format value in uploaded_files.
-- SAEON Terrestrial Observation Monitor portal CSV exports.
-- =============================================================

ALTER TABLE uploaded_files
  DROP CONSTRAINT uploaded_files_file_format_check;

ALTER TABLE uploaded_files
  ADD CONSTRAINT uploaded_files_file_format_check
  CHECK (file_format IN ('hobo_csv', 'solonist_xle', 'campbell_toa5', 'generic_csv', 'saeon_stom'));
