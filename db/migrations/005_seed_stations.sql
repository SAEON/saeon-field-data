-- =============================================================
-- 005_seed_stations.sql
-- Seed known SAEON stations from ipayipi vignette examples.
-- Coordinates marked NULL where not yet confirmed — update once
-- =============================================================


INSERT INTO stations (name, display_name, data_family, region, location, elevation_m, active, notes)
VALUES

  -- ── Rainfall ──────────────────────────────────────────────
  (
    'sileza_camp',
    'Sileza Camp',
    'rainfall',
    'Maputaland',
    NULL,   -- update with GPS once Sue confirms
    NULL,
    true,
    'HOBO rainfall pendant. Example file: Sileza_Camp_2024_06_12.csv'
  ),

  -- ── Groundwater ───────────────────────────────────────────
  (
    'vasi_a1',
    'VASI A1',
    'groundwater',
    'Maputaland',
    NULL,
    NULL,
    true,
    'Solonist LT Levelogger. Requires barologger companion for compensation.'
  ),
  (
    'sibhayi_cf',
    'Sibhayi CF',
    'groundwater',
    'Maputaland',
    NULL,
    NULL,
    true,
    'Solonist LT Levelogger.'
  ),

  -- ── Meteorological ────────────────────────────────────────
  (
    'mcp_vasi_science_centre_aws',
    'MCP Vasi Science Centre AWS',
    'met',
    'Maputaland',
    NULL,
    NULL,
    true,
    'Campbell Scientific. Produces raw_5_min, raw_daily, raw_monthly tables.'
  );


-- ── Data streams for the met station ─────────────────────────
-- Met stations produce multiple streams from one physical logger.
-- Other stations get their streams created automatically by the
-- parser (getOrCreateStream) on first file upload.
INSERT INTO station_data_streams (station_id, stream_name, record_interval_type, record_interval, logger_type)
SELECT
  s.id,
  ds.stream_name,
  ds.record_interval_type,
  ds.record_interval,
  ds.logger_type
FROM stations s
CROSS JOIN (VALUES
  ('raw_5_min',   'continuous', '5 mins', 'campbell_toa5'),
  ('raw_daily',   'continuous', '1 day',  'campbell_toa5'),
  ('raw_monthly', 'continuous', '1 month','campbell_toa5')
) AS ds(stream_name, record_interval_type, record_interval, logger_type)
WHERE s.name = 'mcp_vasi_science_centre_aws';
