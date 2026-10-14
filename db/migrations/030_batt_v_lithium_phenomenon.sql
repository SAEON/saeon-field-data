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
  VALUES ('batt_lith_avg', 'Logger Lithium Battery', 'met', 'V', m_avg, v_num)
  ON CONFLICT (name) DO NOTHING;
END $$;
