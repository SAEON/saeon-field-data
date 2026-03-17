-- =============================================================
-- 015_gap_detection.sql
-- Adds stream_name, has_gap, gap_days to uploaded_files so that
-- post-parse gap detection can be queried without joining
-- through raw_measurements.
-- =============================================================

ALTER TABLE uploaded_files
  ADD COLUMN stream_name TEXT,
  ADD COLUMN has_gap     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN gap_days    INTEGER;
