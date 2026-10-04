-- Fix phen_type naming to align with SAEON phentab standard
UPDATE phenomena SET phen_type = 'Pressure, vapour deficit'  WHERE phen_type = 'Pressure, vapour';
UPDATE phenomena SET phen_type = 'Temperature, ground level' WHERE phen_type = 'Temperature, ground';

-- Normalise unit symbols to proper SI/math notation
UPDATE phenomena SET unit = '°C'   WHERE unit = 'degC';
UPDATE phenomena SET unit = 'W/m²' WHERE unit = 'W/m2';
UPDATE phenomena SET unit = '°'    WHERE unit = 'deg';

-- Expand measure CHECK constraint to align with full SAEON phentab standard
ALTER TABLE phenomena DROP CONSTRAINT IF EXISTS phenomena_measure_check;
ALTER TABLE phenomena ADD CONSTRAINT phenomena_measure_check
  CHECK (measure IN ('avg', 'cumm', 'event', 'logi', 'max', 'min', 'mode', 'sd', 'smp', 'text', 'tot'));

-- Rename var_type values to SAEON phentab tidyverse codes
UPDATE phenomena SET var_type = 'num'   WHERE var_type = 'numeric';
UPDATE phenomena SET var_type = 'int'   WHERE var_type = 'integer';
UPDATE phenomena SET var_type = 'posix' WHERE var_type = 'datetime';

ALTER TABLE phenomena DROP CONSTRAINT IF EXISTS phenomena_var_type_check;
ALTER TABLE phenomena ADD CONSTRAINT phenomena_var_type_check
  CHECK (var_type IN ('chr', 'difftime', 'fac', 'int', 'logi', 'num', 'posix', 'text'));
