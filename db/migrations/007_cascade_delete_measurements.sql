-- =============================================================
-- 007_cascade_delete_measurements.sql
-- Adds ON DELETE CASCADE to raw_measurements.file_id so that
-- deleting a row from uploaded_files automatically removes all
-- associated measurements. Eliminates the need for explicit
-- app-level cleanup before deletion.
-- =============================================================

ALTER TABLE raw_measurements
  DROP CONSTRAINT raw_measurements_file_id_fkey;

ALTER TABLE raw_measurements
  ADD CONSTRAINT raw_measurements_file_id_fkey
  FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE;
