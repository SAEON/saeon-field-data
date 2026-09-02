CREATE TABLE station_sensors (
  id                   SERIAL PRIMARY KEY,
  station_id           INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  instrument_type_id   INTEGER NOT NULL REFERENCES met_instrument_types(id),
  serial_no            TEXT,
  sensitivity_value    NUMERIC,
  effective_from       TIMESTAMPTZ NOT NULL,
  effective_to         TIMESTAMPTZ,
  deployed_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visit_id             INTEGER REFERENCES field_visits(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON station_sensors (station_id, effective_from DESC);
CREATE INDEX ON station_sensors (station_id) WHERE effective_to IS NULL;
CREATE INDEX ON station_sensors (instrument_type_id);
