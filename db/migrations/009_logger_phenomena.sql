-- Add temperature and battery voltage phenomena for HOBO CSV logger data.
-- These are stored as raw_measurements from dual-channel CSV exports and are
-- used by environmental scientists/hydrologists and for visit form pre-population.

INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES
  ('temp_c', 'Logger Temperature', 'all', 'degC', 'sample', 'numeric'),
  ('batt_v', 'Logger Battery',     'all', 'V',    'sample', 'numeric')
ON CONFLICT (name) DO NOTHING;
