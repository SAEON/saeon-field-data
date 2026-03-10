-- =============================================================
-- 010_reading_types.sql
-- Drops the CHECK constraint on manual_readings.reading_type.
--
-- The original constraint only allowed:
--   ('dipper_depth', 'battery_voltage', 'water_colour', 'site_condition', 'other')
--
-- The new UI adds: gauge_condition, gauge_reading, last_emptied,
-- dipper_time, overall_site_condition, pyranometer_clean,
-- anemometer_spinning, rain_gauge_clear, wind_vane, logger_screen.
--
-- Dropping the constraint entirely is simpler than extending it —
-- valid types are enforced by the application layer.
-- =============================================================

ALTER TABLE manual_readings DROP CONSTRAINT manual_readings_reading_type_check;
