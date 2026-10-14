DO $$
DECLARE
  old_measure boolean := EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phenomena_measure_check' AND pg_get_constraintdef(oid) LIKE '%''average''%');
  old_vartype boolean := EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phenomena_var_type_check' AND pg_get_constraintdef(oid) LIKE '%''numeric''%');
  m_avg text := CASE WHEN old_measure THEN 'average' ELSE 'avg' END;
  m_smp text := CASE WHEN old_measure THEN 'sample'  ELSE 'smp' END;
  m_tot text := CASE WHEN old_measure THEN 'total'   ELSE 'tot' END;
  v_num text := CASE WHEN old_vartype THEN 'numeric' ELSE 'num' END;
BEGIN
  INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type, phen_type)
  VALUES
    ('et_ref_tot',      'Reference Evapotranspiration', 'met', 'mm',  m_tot, v_num, 'Evapotranspiration'),
    ('pressure_vpd_avg','Vapour Pressure Deficit',       'met', 'kPa', m_avg, v_num, CASE WHEN old_vartype THEN 'Pressure, vapour' ELSE 'Pressure, vapour deficit' END),
    ('temp_dew_avg',    'Dew Point Temperature',         'met', '°C',  m_avg, v_num, 'Temperature, dew point'),
    ('temp_ground_min', 'Ground Temperature (minimum)',  'met', '°C',  'min', v_num, CASE WHEN old_vartype THEN 'Temperature, ground' ELSE 'Temperature, ground level' END),
    ('wind_dir_sd',     'Wind Direction (std dev)',       'met', '°',   'sd',  v_num, 'Wind direction')
  ON CONFLICT (name) DO NOTHING;
END $$;
