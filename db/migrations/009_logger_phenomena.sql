INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES
  ('temp_c', 'Logger Temperature', 'all', 'degC', 'smp', 'num'),
  ('batt_v', 'Logger Battery',     'all', 'V',    'smp', 'num')
ON CONFLICT (name) DO NOTHING;
