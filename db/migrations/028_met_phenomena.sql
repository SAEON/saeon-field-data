-- Migration 028: Add additional met phenomena for UV radiation, soil temperature,
-- leaf wetness, and soil moisture (observed in sample .dat files from field stations).

INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES
  ('uv_rad_avg',       'UV Radiation',        'met', 'W/m²',  'average', 'numeric'),
  ('soil_temp_avg',    'Soil Temperature',     'met', 'degC',  'average', 'numeric'),
  ('leaf_wetness_mv',  'Leaf Wetness',         'met', 'mV',    'sample',  'numeric'),
  ('soil_moisture_avg','Soil Moisture (VWC)',  'met', '%',     'average', 'numeric')
ON CONFLICT (name) DO NOTHING;
