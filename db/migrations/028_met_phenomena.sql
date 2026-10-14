DO $$
DECLARE
  old_measure boolean := EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phenomena_measure_check' AND pg_get_constraintdef(oid) LIKE '%''average''%');
  old_vartype boolean := EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phenomena_var_type_check' AND pg_get_constraintdef(oid) LIKE '%''numeric''%');
  m_avg text := CASE WHEN old_measure THEN 'average' ELSE 'avg' END;
  m_smp text := CASE WHEN old_measure THEN 'sample'  ELSE 'smp' END;
  m_tot text := CASE WHEN old_measure THEN 'total'   ELSE 'tot' END;
  v_num text := CASE WHEN old_vartype THEN 'numeric' ELSE 'num' END;
BEGIN
  INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
  SELECT v.name, v.display_name, v.data_family, v.unit, v.measure, v.var_type
  FROM (VALUES
    ('uv_rad_avg',        'rad_uv_avg',        'UV Radiation',       'met', 'W/m²', m_avg, v_num),
    ('soil_temp_avg',     'temp_soil_avg',     'Soil Temperature',   'met', CASE WHEN old_vartype THEN 'degC' ELSE '°C' END, m_avg, v_num),
    ('leaf_wetness_mv',   'leaf_wet_avg',      'Leaf Wetness',       'met', 'mV',   m_smp, v_num),
    ('soil_moisture_avg', 'moisture_soil_avg', 'Soil Moisture (VWC)','met', '%',    m_avg, v_num)
  ) AS v(name, final_name, display_name, data_family, unit, measure, var_type)
  WHERE NOT EXISTS (SELECT 1 FROM phenomena p WHERE p.name IN (v.name, v.final_name))
  ON CONFLICT (name) DO NOTHING;
END $$;
