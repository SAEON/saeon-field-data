-- Add flag_reason to individual tip records in raw_measurements.
-- Records why each tip was flagged, not just which flag type was applied.
ALTER TABLE raw_measurements
  ADD COLUMN flag_reason TEXT
  CHECK (flag_reason IN ('1s_bounce', 'visit_proximity', 'manual_tip', 'non_rainfall_entry'));

-- Add split pseudo_event reason counts to 5-min rainfall aggregates.
-- Invariant: manual_tip_count + non_rainfall_count = pseudo_event_count
-- pseudo_event_count is kept for backward compatibility.
ALTER TABLE rainfall
  ADD COLUMN manual_tip_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN non_rainfall_count INTEGER NOT NULL DEFAULT 0;