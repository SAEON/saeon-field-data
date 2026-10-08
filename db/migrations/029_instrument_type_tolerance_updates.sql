-- ── 1. RH tolerance: 2 → 3 ───────────────────────────────────────────────────

UPDATE met_instrument_types
SET parameters = jsonb_set(parameters, '{humidity,tolerance}', '3', false)
WHERE category IN ('temperature_humidity', 'weather_station')
  AND parameters ? 'humidity';

-- ── 2. Rain gauge: add parameters with 3% tolerance ──────────────────────────
-- Assumes a standardised reference-volume test yielding ~100 mm equivalent;
-- ±3 mm absolute tolerance = ±3%.

UPDATE met_instrument_types
SET parameters = '{"rainfall":{"range":null,"accuracy":null,"resolution":null,"tolerance":3}}'::jsonb
WHERE category = 'rain_gauge'
  AND parameters IS NULL;
