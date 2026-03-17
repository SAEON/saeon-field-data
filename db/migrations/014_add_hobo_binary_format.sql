-- =============================================================
-- 014_add_hobo_binary_format.sql
-- Adds 'hobo_binary' as a valid file_format value in uploaded_files.
-- =============================================================

ALTER TABLE uploaded_files
  DROP CONSTRAINT uploaded_files_file_format_check;

ALTER TABLE uploaded_files
  ADD CONSTRAINT uploaded_files_file_format_check
  CHECK (file_format IN ('hobo_csv', 'solonist_xle', 'campbell_toa5', 'generic_csv', 'saeon_stom', 'hobo_binary'));
