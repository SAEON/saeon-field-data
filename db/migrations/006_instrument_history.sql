-- Instrument swap history for rainfall stations.
-- Tracks raingauge and datalogger serial number changes over time.
-- This is the authoritative source for:
--   - Historical serial numbers per instrument type
--   - mm_per_tip calibration periods (raingauge only) — used by the rainfall processor
--   - Audit trail of who recorded each change and which visit it was linked to
--
-- All roles (technician, technician_lead, data_manager) can create records.
-- stations.serial_no is kept as the quick-read current active serial and is
-- updated alongside each insert here.

CREATE TABLE instrument_history (
  id              SERIAL PRIMARY KEY,
  station_id      INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  instrument_type TEXT    NOT NULL CHECK (instrument_type IN ('raingauge', 'datalogger')),
  serial_no       TEXT    NOT NULL,
  mm_per_tip      NUMERIC(6,4),        -- raingauge only; NULL for datalogger rows
  visit_id        INTEGER REFERENCES field_visits(id) ON DELETE SET NULL,
  effective_from  TIMESTAMPTZ NOT NULL, -- derived from field_visits.visited_at
  recorded_by     INTEGER NOT NULL REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast calibration period lookup for the rainfall processor
CREATE INDEX ON instrument_history (station_id, instrument_type, effective_from DESC);
