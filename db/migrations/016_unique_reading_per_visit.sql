-- One row per reading_type per visit — duplicates from toggling are now upserted.
-- Clean up existing duplicates first (keep the latest recorded_at per group).
DELETE FROM manual_readings
WHERE id NOT IN (
  SELECT DISTINCT ON (visit_id, reading_type) id
  FROM manual_readings
  ORDER BY visit_id, reading_type, recorded_at DESC
);

ALTER TABLE manual_readings
  ADD CONSTRAINT manual_readings_visit_reading_unique
  UNIQUE (visit_id, reading_type);
