INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES
  ('uv_rad_avg',       'UV Radiation',        'met', 'W/m²',  'avg', 'num'),
  ('soil_temp_avg',    'Soil Temperature',     'met', 'degC',  'avg', 'num'),
  ('leaf_wetness_mv',  'Leaf Wetness',         'met', 'mV',    'smp', 'num'),
  ('soil_moisture_avg','Soil Moisture (VWC)',  'met', '%',     'avg', 'num')
ON CONFLICT (name) DO NOTHING;
