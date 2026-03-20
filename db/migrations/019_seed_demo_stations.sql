-- 019_seed_demo_stations.sql
-- Adds Cathedral Peak and Bambanani rainfall stations.
-- Enriches ALL stations with proper notes, coordinates, and elevation.
-- Safe to re-run (INSERT uses ON CONFLICT DO NOTHING; UPDATEs are idempotent).

INSERT INTO stations (name, display_name, data_family, region, location, elevation_m, active, notes)
VALUES
  (
    'cathedral_peak',
    'Cathedral Peak',
    'rainfall',
    'Mpumalanga',
    ST_SetSRID(ST_MakePoint(30.7821, -25.3156), 4326),
    1420,
    true,
    'HOBO tipping bucket rainfall logger. Monitors high-altitude precipitation in the Cathedral Peak catchment.'
  ),
  (
    'bambanani',
    'Bambanani',
    'rainfall',
    'Mpumalanga',
    ST_SetSRID(ST_MakePoint(31.1045, -25.8734), 4326),
    890,
    true,
    'HOBO tipping bucket rainfall logger. Monitors rainfall patterns in the Bambanani catchment area.'
  )
ON CONFLICT (name) DO NOTHING;


-- ── Enrich all stations with proper notes, coordinates, and elevation ──────────

UPDATE stations SET
  location    = ST_SetSRID(ST_MakePoint(30.3412, -23.8956), 4326),
  elevation_m = 728,
  region      = 'Limpopo',
  notes       = 'HOBO tipping bucket rainfall logger (RG3-M). Primary rainfall monitoring station for the Siyadla catchment. Managed by SAEON Limpopo node.'
WHERE name = 'siyadla_camp';

UPDATE stations SET
  location    = ST_SetSRID(ST_MakePoint(21.8734, -33.4102), 4326),
  elevation_m = 312,
  region      = 'Western Cape',
  notes       = 'HOBO tipping bucket rainfall logger. Monitors seasonal rainfall in the Klein Karoo semi-arid region. Unattended — remote logger download during scheduled visits.'
WHERE name = 'klein_karoo';

UPDATE stations SET
  location    = ST_SetSRID(ST_MakePoint(30.7821, -25.3156), 4326),
  elevation_m = 1420,
  notes       = 'HOBO tipping bucket rainfall logger. Monitors high-altitude precipitation in the Cathedral Peak catchment.'
WHERE name = 'cathedral_peak';

UPDATE stations SET
  location    = ST_SetSRID(ST_MakePoint(31.1045, -25.8734), 4326),
  elevation_m = 890,
  notes       = 'HOBO tipping bucket rainfall logger. Monitors rainfall patterns in the Bambanani catchment area.'
WHERE name = 'bambanani';
