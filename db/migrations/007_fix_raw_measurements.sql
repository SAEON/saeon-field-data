-- =============================================================
-- 007_fix_raw_measurements.sql
-- Drop the unique constraint on (stream_id, phenomenon_id, measured_at).
--
-- HOBO binary loggers record time at 1-minute resolution. Two genuine tips
-- within the same minute produce identical timestamps, so a UNIQUE constraint
-- silently drops the second tip. Overlap across re-uploads is handled by the
-- delete-then-insert pattern in parseInBackground (routes/files.js) instead.
-- =============================================================

ALTER TABLE raw_measurements
  DROP CONSTRAINT IF EXISTS raw_measurements_stream_id_phenomenon_id_measured_at_key;
