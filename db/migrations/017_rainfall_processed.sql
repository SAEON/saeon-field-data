-- 017_rainfall_processed.sql
-- QA classification on individual tips + pre-computed 5-min rainfall aggregates.
--
-- raw_measurements.qa_flag — marks false tips before aggregation:
--   NULL         = valid tip (counts toward rain_mm)
--   'interfere'  = logged within ±600s of a visit (coupler/host events)
--   'pseudo_event' = falls within a technician-recorded non-rainfall water entry window
--   'double_tip' = consecutive tips exactly 1 second apart (sensor bounce)
--
-- rainfall — 5-minute aggregates computed from QA-passed tips only.
--   Coarser resolutions (hourly/daily/monthly/yearly) are derived at query time
--   via DATE_TRUNC + SUM — no separate tables needed.

ALTER TABLE raw_measurements
  ADD COLUMN qa_flag TEXT
    CHECK (qa_flag IN ('interfere', 'pseudo_event', 'double_tip'));

-- Index for fast QA lookups (re-processing, audit)
CREATE INDEX ON raw_measurements (stream_id, qa_flag) WHERE qa_flag IS NOT NULL;


CREATE TABLE rainfall (
  id           BIGSERIAL PRIMARY KEY,
  station_id   INTEGER      NOT NULL REFERENCES stations(id),
  stream_id    INTEGER      NOT NULL REFERENCES station_data_streams(id),
  period_start TIMESTAMPTZ  NOT NULL,
  -- 5-minute window: period_start to period_start + 5 minutes (exclusive)
  rain_mm      NUMERIC(8,3) NOT NULL DEFAULT 0,
  tip_count    INTEGER      NOT NULL DEFAULT 0,   -- total tips in window (including false)
  valid_tips   INTEGER      NOT NULL DEFAULT 0,   -- tips with qa_flag IS NULL
  is_anomaly   BOOLEAN      NOT NULL DEFAULT FALSE, -- rain_mm > 10 within this window
  processed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (stream_id, period_start)
);

-- Time-series query index
CREATE INDEX ON rainfall (station_id, period_start DESC);
CREATE INDEX ON rainfall (stream_id,  period_start DESC);
