
UPDATE met_instrument_types t
SET maintenance_checks = (
  SELECT jsonb_object_agg(k, k = ANY (g.flags))
  FROM unnest(ARRAY[
    'physical_condition', 'cleanliness', 'cleaning_done', 'level_as_found', 'level_if_adjusted',
    'live_reading', 'sensor_element_replaced', 'filter_replacement', 'desiccant_replaced',
    'orientation_verification', 'bearing_condition', 'bearings_replaced', 'wetness_test'
  ]) AS k
)
FROM (VALUES
  -- Temp / RH with replaceable sensor element
  ('Campbell Scientific CS215',        ARRAY['physical_condition','cleanliness','cleaning_done','live_reading','sensor_element_replaced','filter_replacement']),
  ('Campbell Scientific Hygrovue 5',   ARRAY['physical_condition','cleanliness','cleaning_done','live_reading','sensor_element_replaced','filter_replacement']),
  ('Campbell Scientific Hygrovue 10',  ARRAY['physical_condition','cleanliness','cleaning_done','live_reading','sensor_element_replaced','filter_replacement']),
  -- Temp / RH without sensor element replacement
  ('Rotronic HC2S3',                   ARRAY['physical_condition','cleanliness','cleaning_done','live_reading','filter_replacement']),
  ('E+E Elektronik EE181',             ARRAY['physical_condition','cleanliness','cleaning_done','live_reading','filter_replacement']),
  -- Pressure
  ('Vaisala PTB110',                   ARRAY['physical_condition','cleanliness','cleaning_done','live_reading']),
  ('Campbell Scientific Barovue',      ARRAY['physical_condition','cleanliness','cleaning_done','live_reading']),
  -- Multi-parameter weather sensor
  ('Campbell Scientific Climavue 50 G2', ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading','filter_replacement','orientation_verification']),
  -- Rain gauges and snow (no live reading)
  ('Texas Electronics TR-525 6"',          ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted']),
  ('Texas Electronics TE-525 6"',          ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted']),
  ('Texas Electronics TR525-USW 8"',       ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted']),
  ('Texas Electronics TR-525-I-01-CA 6"',  ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted']),
  ('Texas Electronics TR525-U-01-CA 8"',   ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted']),
  ('RM Young 52202',                       ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted']),
  -- Wind
  ('RM Young 03002',                   ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading','orientation_verification','bearing_condition','bearings_replaced']),
  ('Gill Instruments Windsonic WS75',  ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading','orientation_verification']),
  -- Radiation
  ('Kipp & Zonen CMP3',                ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading']),
  ('Kipp & Zonen NR Lite 2',           ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading']),
  ('LICOR LI-190',                     ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading']),
  ('Kipp & Zonen CUV5',                ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading','desiccant_replaced']),
  ('Kipp & Zonen CNR4',                ARRAY['physical_condition','cleanliness','cleaning_done','level_as_found','level_if_adjusted','live_reading','desiccant_replaced']),
  -- Soil
  ('Campbell Scientific CS616',        ARRAY['physical_condition','live_reading']),
  ('Campbell Scientific CS655',        ARRAY['physical_condition','live_reading']),
  ('Campbell Scientific T107',         ARRAY['physical_condition','live_reading']),
  ('Campbell Scientific T108',         ARRAY['physical_condition','cleanliness','cleaning_done','live_reading']),
  ('Campbell Scientific T109',         ARRAY['physical_condition','cleanliness','cleaning_done','live_reading']),
  -- Leaf wetness
  ('Meter Group Phytos 31',            ARRAY['physical_condition','cleanliness','cleaning_done','live_reading','wetness_test'])
) AS g(label, flags)
WHERE t.label = g.label;


DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(label, ', ') INTO missing
  FROM met_instrument_types
  WHERE NOT (maintenance_checks ? 'physical_condition');
  IF missing IS NOT NULL THEN
    RAISE WARNING 'maintenance_checks not updated for: %', missing;
  END IF;
END $$;
