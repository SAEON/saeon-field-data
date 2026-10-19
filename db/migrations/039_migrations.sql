-- Follow-up notes
CREATE TABLE IF NOT EXISTS followup_notes (
  id         SERIAL PRIMARY KEY,
  visit_id   INTEGER NOT NULL REFERENCES field_visits(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note       TEXT NOT NULL CHECK (length(btrim(note)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at  TIMESTAMPTZ,
  edited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS followup_notes_visit_idx ON followup_notes (visit_id, created_at);

-- Visits started offline carry a client-made reference, so a retried create returns the same visit
ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS client_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS field_visits_client_ref_uq
  ON field_visits (technician_id, client_ref) WHERE client_ref IS NOT NULL;

-- Asset numbers and position labels
ALTER TABLE station_sensors
  ADD COLUMN IF NOT EXISTS asset_no       TEXT,
  ADD COLUMN IF NOT EXISTS position_label TEXT;

ALTER TABLE instrument_history ALTER COLUMN serial_no DROP NOT NULL;
ALTER TABLE instrument_history ADD COLUMN IF NOT EXISTS asset_no TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instrument_history_identifier_check') THEN
    ALTER TABLE instrument_history
      ADD CONSTRAINT instrument_history_identifier_check
      CHECK (serial_no IS NOT NULL OR asset_no IS NOT NULL);
  END IF;
END $$;

ALTER TABLE stations ADD COLUMN IF NOT EXISTS asset_no TEXT;

ALTER TABLE met_instrument_types ADD COLUMN IF NOT EXISTS serial_expected BOOLEAN NOT NULL DEFAULT true;
UPDATE met_instrument_types SET serial_expected = false WHERE category IN ('soil', 'leaf_wetness');

-- Unique active sensor identifiers (per model, ignoring case and surrounding spaces)
DO $$
DECLARE
  dup text;
BEGIN
  SELECT string_agg(format('%s %s "%s" at station ids %s', kind, instrument_type_id, ident, stations), E'\n')
    INTO dup
  FROM (
    SELECT 'serial' AS kind, instrument_type_id, lower(btrim(serial_no)) AS ident,
           string_agg(station_id::text, ', ' ORDER BY station_id) AS stations
    FROM station_sensors
    WHERE effective_to IS NULL AND btrim(serial_no) <> ''
    GROUP BY instrument_type_id, lower(btrim(serial_no)) HAVING count(*) > 1
    UNION ALL
    SELECT 'asset', instrument_type_id, lower(btrim(asset_no)),
           string_agg(station_id::text, ', ' ORDER BY station_id)
    FROM station_sensors
    WHERE effective_to IS NULL AND btrim(asset_no) <> ''
    GROUP BY instrument_type_id, lower(btrim(asset_no)) HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION E'Duplicate active sensor identifiers (instrument type id, value, stations) - correct or retire these first:\n%', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS station_sensors_active_serial_uq
  ON station_sensors (instrument_type_id, lower(btrim(serial_no)))
  WHERE effective_to IS NULL AND btrim(serial_no) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS station_sensors_active_asset_uq
  ON station_sensors (instrument_type_id, lower(btrim(asset_no)))
  WHERE effective_to IS NULL AND btrim(asset_no) <> '';
