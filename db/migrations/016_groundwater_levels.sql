-- Processed groundwater level readings after barometric compensation.
-- Analogous to the rainfall table: written by a processor, read by the API.
--
-- level_m_raw  : raw logger reading (includes atmospheric pressure)
-- baro_kpa     : interpolated baro pressure used for this row's compensation
-- level_m_comp : baro-compensated water column (level_m_raw - baro_kpa / 9.80665)
-- Depth-to-water is derived at query time from dipper readings in manual_readings.

CREATE TABLE groundwater_levels (
  id                 BIGSERIAL    PRIMARY KEY,
  station_id         INTEGER      NOT NULL REFERENCES stations(id),
  stream_id          INTEGER      NOT NULL REFERENCES station_data_streams(id),
  measured_at        TIMESTAMPTZ  NOT NULL,
  level_m_raw        NUMERIC,
  baro_kpa           NUMERIC,
  level_m_comp       NUMERIC,
  temp_c             NUMERIC,
  conductivity_us_cm NUMERIC,
  processed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (stream_id, measured_at)
);

CREATE INDEX idx_gw_station_time ON groundwater_levels (station_id, measured_at DESC);
CREATE INDEX idx_gw_stream_time  ON groundwater_levels (stream_id,  measured_at DESC);
