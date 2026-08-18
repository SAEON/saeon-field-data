-- QA intervention records for the groundwater processing pipeline.
-- Sourced from Michele's data_handle Google Sheet tab.
--
-- Two handle types feed directly into the R-pipeline processing stages:
--   dummy_drift     — synthetic calibration pivot point inserted when real dipper readings
--                     are too far apart; anchors drift_offset_m calculations.
--                     Point event: end_at is NULL.
--   manual_outliers — time range of anomalous data to exclude from level_m_cleaned
--                     before drift correction is applied. Requires end_at.
--
-- qa = FALSE means the handle is NOT applied in the processing pipeline.
-- Handles remain provisional (qa=FALSE) until a data_manager verifies them.
-- The processor must filter WHERE qa = TRUE before applying any handle.

CREATE TABLE data_handles (
  id          SERIAL PRIMARY KEY,
  station_id  INTEGER     NOT NULL REFERENCES stations(id),
  handle_type TEXT        NOT NULL CHECK (handle_type IN ('dummy_drift', 'manual_outliers')),
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ,          -- NULL for dummy_drift; required for manual_outliers
  qa          BOOLEAN     NOT NULL DEFAULT false,
  recorded_by INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX data_handles_station_id_idx ON data_handles (station_id);
CREATE INDEX data_handles_start_at_idx   ON data_handles (station_id, start_at);
