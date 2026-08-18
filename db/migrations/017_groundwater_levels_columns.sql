-- Extend groundwater_levels with full processing pipeline columns (R log_t equivalents).
-- Add casing_ht_m to stations for dipper-to-depth-to-water conversion.
--
-- bt_outlier / bt_outlier_rule : Hampel filter output (outlier flag + rule that triggered)
-- level_m_cleaned               : baro-compensated level after outlier removal (R: t_bt_level_m)
-- drift_offset_m                : linear drift correction applied between dipper calibrations
-- level_m_asl                   : FINAL water level in metres above sea level (R: t_level_m)
--
-- casing_ht_m: fixed height of borehole casing collar above ground surface (e.g. 0.17 m).
-- Used in: depth_to_water = dipper_depth_m - casing_ht_m
--          level_m_asl    = elevation_m     - depth_to_water
--
-- IMPORTANT: stations.elevation_m for groundwater stations = H_masl, i.e. the surveyed
-- elevation of the borehole casing reference mark above sea level (NOT ground surface).
-- Source: datum_log.csv in the ipayipi R pipeline. Example: WES01 = 62 m, APU1 = 29 m.

ALTER TABLE groundwater_levels
  ADD COLUMN bt_outlier      BOOLEAN,
  ADD COLUMN bt_outlier_rule TEXT,
  ADD COLUMN level_m_cleaned NUMERIC,
  ADD COLUMN drift_offset_m  NUMERIC,
  ADD COLUMN level_m_asl     NUMERIC;

ALTER TABLE stations ADD COLUMN casing_ht_m NUMERIC;
