-- =============================================================
-- 004_seed.sql
-- Run fourth. Inserts baseline reference data.
--
-- Phenomena are required for the app to function — parsers and
-- the rainfall processor look up phenomenon IDs by name.
-- Users and stations are managed through the app (Keycloak + API).
-- =============================================================


-- -------------------------------------------------------------
-- PHENOMENA
-- Known measured variables across all three data families.
-- Add more rows as new sensor types are introduced.
-- -------------------------------------------------------------
INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type) VALUES

  -- Rainfall
  ('rainfall_tot',        'Rainfall (total)',                   'rainfall',    'mm',    'total',   'numeric'),
  ('rain_tip',            'Rainfall Tip Event',                 'rainfall',    'mm',    'sample',  'numeric'),
  ('logger_interference', 'Logger Interference Event',          'all',         '',      'sample',  'text'),

  -- Groundwater
  ('water_level_smp',     'Water Level (sample)',               'groundwater', 'm',     'sample',  'numeric'),
  ('water_temp_smp',      'Water Temperature (sample)',         'groundwater', 'degC',  'sample',  'numeric'),
  ('baro_pressure_smp',   'Barometric Pressure (sample)',       'groundwater', 'kPa',   'sample',  'numeric'),

  -- Meteorological
  ('air_temp_avg',        'Air Temperature (average)',          'met',         'degC',  'average', 'numeric'),
  ('air_temp_min',        'Air Temperature (minimum)',          'met',         'degC',  'min',     'numeric'),
  ('air_temp_max',        'Air Temperature (maximum)',          'met',         'degC',  'max',     'numeric'),
  ('rh_avg',              'Relative Humidity (average)',        'met',         '%',     'average', 'numeric'),
  ('wind_speed_avg',      'Wind Speed (average)',               'met',         'm/s',   'average', 'numeric'),
  ('wind_dir_avg',        'Wind Direction (average)',           'met',         'deg',   'average', 'numeric'),
  ('solar_rad_avg',       'Solar Radiation (average)',          'met',         'W/m2',  'average', 'numeric'),
  ('atm_pressure_avg',    'Atmospheric Pressure (average)',     'met',         'hPa',   'average', 'numeric'),
  ('rain_tot',            'Rainfall Total (met station)',       'met',         'mm',    'total',   'numeric');
