INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES ('batt_lith_avg', 'Logger Lithium Battery', 'met', 'V', 'avg', 'num')
ON CONFLICT (name) DO NOTHING;
