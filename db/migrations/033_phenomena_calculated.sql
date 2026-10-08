INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type, phen_type)
VALUES
  ('et_ref_tot',      'Reference Evapotranspiration', 'met', 'mm',  'tot', 'num', 'Evapotranspiration'),
  ('pressure_vpd_avg','Vapour Pressure Deficit',       'met', 'kPa', 'avg', 'num', 'Pressure, vapour'),
  ('temp_dew_avg',    'Dew Point Temperature',         'met', '°C',  'avg', 'num', 'Temperature, dew point'),
  ('temp_ground_min', 'Ground Temperature (minimum)',  'met', '°C',  'min', 'num', 'Temperature, ground'),
  ('wind_dir_sd',     'Wind Direction (std dev)',       'met', '°',   'sd',  'num', 'Wind direction')
ON CONFLICT (name) DO NOTHING;
