-- 1. Add phen_type column
ALTER TABLE phenomena ADD COLUMN IF NOT EXISTS phen_type TEXT;

-- 2. Drop old constraint before any updates
ALTER TABLE phenomena DROP CONSTRAINT IF EXISTS phenomena_measure_check;

-- 2b. Remove any pre-existing rows with target names that would block renames
--     (only safe to delete rows with no measurements)
DELETE FROM phenomena
WHERE name IN (
  'temp_air_avg','temp_air_min','temp_air_max','humid_rel_avg',
  'rad_solar_avg','pressure_atm_avg','rad_uv_avg','temp_soil_avg',
  'leaf_wet_avg','moisture_soil_avg','temp_logg_avg','batt_avg','batt_lith_avg'
)
AND id NOT IN (
  SELECT DISTINCT phenomenon_id FROM raw_measurements WHERE phenomenon_id IS NOT NULL
);

-- 3. Rename met phenomena + update measure + set phen_type
UPDATE phenomena SET name = 'temp_air_avg',      measure = 'avg', phen_type = 'Temperature, air'         WHERE name = 'air_temp_avg';
UPDATE phenomena SET name = 'temp_air_min',                        phen_type = 'Temperature, air'         WHERE name = 'air_temp_min';
UPDATE phenomena SET name = 'temp_air_max',                        phen_type = 'Temperature, air'         WHERE name = 'air_temp_max';
UPDATE phenomena SET name = 'humid_rel_avg',     measure = 'avg', phen_type = 'Humidity, relative'        WHERE name = 'rh_avg';
UPDATE phenomena SET name = 'rad_solar_avg',     measure = 'avg', phen_type = 'Radiation, solar'          WHERE name = 'solar_rad_avg';
UPDATE phenomena SET name = 'pressure_atm_avg',  measure = 'avg', phen_type = 'Pressure, atmosphere'      WHERE name = 'atm_pressure_avg';
UPDATE phenomena SET name = 'rad_uv_avg',        measure = 'avg', phen_type = 'Radiation, ultra violet'   WHERE name = 'uv_rad_avg';
UPDATE phenomena SET name = 'temp_soil_avg',     measure = 'avg', phen_type = 'Temperature, soil'         WHERE name = 'soil_temp_avg';
UPDATE phenomena SET name = 'leaf_wet_avg',      measure = 'smp', phen_type = 'Leaf wetness'              WHERE name = 'leaf_wetness_mv';
UPDATE phenomena SET name = 'moisture_soil_avg', measure = 'avg', phen_type = 'Moisture, soil'            WHERE name = 'soil_moisture_avg';
UPDATE phenomena SET name = 'temp_logg_avg',     measure = 'smp', phen_type = 'Temperature, logger'       WHERE name = 'temp_c';
UPDATE phenomena SET name = 'batt_avg',          measure = 'smp', phen_type = 'Battery level'             WHERE name = 'batt_v';
UPDATE phenomena SET name = 'batt_lith_avg',     measure = 'avg', phen_type = 'Battery level'             WHERE name = 'batt_v_lithium';

-- 4. Unchanged names — update measure abbreviation + phen_type
UPDATE phenomena SET measure = 'avg', phen_type = 'Wind speed'      WHERE name = 'wind_speed_avg';
UPDATE phenomena SET measure = 'avg', phen_type = 'Wind direction'   WHERE name = 'wind_dir_avg';
UPDATE phenomena SET measure = 'tot', phen_type = 'Precipitation'    WHERE name = 'rain_tot';

-- 5. Non-met phenomena — measure abbreviation + phen_type only
UPDATE phenomena SET measure = 'tot', phen_type = 'Precipitation'        WHERE name = 'rainfall_tot';
UPDATE phenomena SET measure = 'smp', phen_type = 'Precipitation'        WHERE name = 'rain_tip';
UPDATE phenomena SET measure = 'smp', phen_type = 'Interference event'   WHERE name = 'logger_interference';
UPDATE phenomena SET measure = 'smp', phen_type = 'Water level'          WHERE name = 'water_level_smp';
UPDATE phenomena SET measure = 'smp', phen_type = 'Temperature, water'   WHERE name = 'water_temp_smp';
UPDATE phenomena SET measure = 'smp', phen_type = 'Pressure, atmosphere' WHERE name = 'baro_pressure_smp';
UPDATE phenomena SET measure = 'smp', phen_type = 'Electroconductivity'  WHERE name = 'conductivity_smp';

-- 6. Add missing wind_speed_max
INSERT INTO phenomena (name, display_name, data_family, unit, measure, var_type, phen_type)
VALUES ('wind_speed_max', 'Wind Speed (maximum)', 'met', 'm/s', 'max', 'num', 'Wind speed')
ON CONFLICT (name) DO NOTHING;

-- 7. Add new constraint (idempotent)
ALTER TABLE phenomena DROP CONSTRAINT IF EXISTS phenomena_measure_check;
ALTER TABLE phenomena ADD CONSTRAINT phenomena_measure_check
  CHECK (measure IN ('smp', 'avg', 'min', 'max', 'tot', 'sd'));
