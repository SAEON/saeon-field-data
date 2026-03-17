-- =============================================================
-- 013_add_rain_tip_phenomenon.sql
-- Adds the rain_tip phenomenon used by the HOBO binary parser.
-- Each row represents one tipping-bucket tip event (0.254 mm).
-- =============================================================

INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES ('rain_tip', 'Rainfall Tip Event', 'rainfall', 'mm', 'sample', 'numeric')
ON CONFLICT (name) DO NOTHING;
