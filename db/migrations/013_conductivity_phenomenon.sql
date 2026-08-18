-- Add electrical conductivity phenomenon for 3-channel Solinst LTC/L5_LTC loggers.

INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type)
VALUES ('conductivity_smp', 'Electrical Conductivity (sample)', 'groundwater', 'µS/cm', 'sample', 'numeric')
ON CONFLICT (name) DO NOTHING;
