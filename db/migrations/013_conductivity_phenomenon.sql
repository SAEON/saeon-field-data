INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES ('conductivity_smp', 'Electrical Conductivity (sample)', 'groundwater', 'µS/cm', 'smp', 'num')
ON CONFLICT (name) DO NOTHING;
