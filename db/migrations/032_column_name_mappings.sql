ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS has_unmapped_columns BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS column_name_mappings (
  id             SERIAL PRIMARY KEY,
  raw_name       TEXT NOT NULL,
  phenomenon_id  INTEGER REFERENCES phenomena(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'ignored')),
  data_family    TEXT,
  source_file_id INTEGER REFERENCES uploaded_files(id) ON DELETE SET NULL,
  station_id     INTEGER REFERENCES stations(id) ON DELETE SET NULL,
  resolved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (raw_name)
);

CREATE INDEX IF NOT EXISTS column_name_mappings_pending_idx
  ON column_name_mappings (status) WHERE status = 'pending';
