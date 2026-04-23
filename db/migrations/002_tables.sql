-- =============================================================
-- 002_tables.sql
-- Run second. Creates all tables in dependency order.
-- =============================================================


-- -------------------------------------------------------------
-- USERS
-- No passwords stored here — authentication is handled externally
-- via Microsoft Azure AD (OAuth) or a standalone auth tool (e.g. Keycloak).
-- We store the identity provider's unique identifier (auth_provider_id)
-- to match the incoming token to a user record.
--
-- Login flow:
--   1. User clicks "Sign in with Microsoft" (or standalone login)
--   2. Auth provider returns a token containing their unique ID + email
--   3. API looks up users.auth_provider_id to find the user record
--   4. If not found — access denied (a manager must create the user first)
-- -------------------------------------------------------------
CREATE TABLE users (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  full_name         TEXT NOT NULL,
  role              TEXT NOT NULL
    CHECK (role IN ('technician', 'technician_lead', 'data_manager')),

  -- Set auth_provider based on what you end up using:
  --   'microsoft' = Azure AD / Microsoft 365 (preferred - SAEON is on Microsoft)
  --   'keycloak'  = self-hosted Keycloak (good open source fallback)
  --   'local'     = simple JWT fallback for development/testing only
  auth_provider     TEXT NOT NULL DEFAULT 'keycloak'
    CHECK (auth_provider IN ('microsoft', 'keycloak', 'local')),

  -- Unique ID from the auth provider.
  -- Microsoft : Azure AD Object ID  (the 'oid' claim in the JWT)
  -- Keycloak  : subject ID          (the 'sub' claim in the JWT)
  -- Local     : a UUID generated at user creation time
  auth_provider_id  TEXT UNIQUE,

  display_name      TEXT,
  initials          VARCHAR(2),
  last_login        TIMESTAMPTZ,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -------------------------------------------------------------
-- STATIONS
-- -------------------------------------------------------------
CREATE TABLE stations (
  id                     SERIAL PRIMARY KEY,
  name                   TEXT NOT NULL UNIQUE,
  display_name           TEXT NOT NULL,
  data_family            TEXT NOT NULL
    CHECK (data_family IN ('rainfall', 'groundwater', 'met')),
  region                 TEXT,
  location               GEOGRAPHY(POINT, 4326),
  elevation_m            NUMERIC,
  active                 BOOLEAN NOT NULL DEFAULT true,
  notes                  TEXT,
  serial_no              TEXT,
  visit_frequency_days   INTEGER NOT NULL DEFAULT 30,
  assigned_technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -------------------------------------------------------------
-- STATION DATA STREAMS
-- -------------------------------------------------------------
CREATE TABLE station_data_streams (
  id                   SERIAL PRIMARY KEY,
  station_id           INTEGER NOT NULL REFERENCES stations(id),
  stream_name          TEXT NOT NULL,
  record_interval_type TEXT NOT NULL
    CHECK (record_interval_type IN ('continuous', 'event_based')),
  record_interval      TEXT,
  logger_type          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, stream_name)
);


-- -------------------------------------------------------------
-- FIELD VISITS
-- -------------------------------------------------------------
CREATE TABLE field_visits (
  id                     SERIAL PRIMARY KEY,
  station_id             INTEGER NOT NULL REFERENCES stations(id),
  technician_id          INTEGER NOT NULL REFERENCES users(id),
  visited_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at           TIMESTAMPTZ,
  notes                  TEXT,
  status                 TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'submitted', 'approved', 'flagged')),
  assigned_technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);


-- -------------------------------------------------------------
-- UPLOADED FILES
-- -------------------------------------------------------------
CREATE TABLE uploaded_files (
  id                   SERIAL PRIMARY KEY,
  visit_id             INTEGER NOT NULL REFERENCES field_visits(id),
  original_name        TEXT NOT NULL,
  file_hash            TEXT NOT NULL,
  file_size_bytes      INTEGER,
  storage_path         TEXT NOT NULL,
  file_format          TEXT NOT NULL
    CHECK (file_format IN (
      'hobo_csv', 'solonist_xle', 'campbell_toa5',
      'generic_csv', 'saeon_stom', 'hobo_binary'
    )),
  date_range_start     TIMESTAMPTZ,
  date_range_end       TIMESTAMPTZ,
  record_count         INTEGER,
  parse_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (parse_status IN ('pending', 'parsed', 'error')),
  parse_error          TEXT,
  stream_name          TEXT,
  has_gap              BOOLEAN NOT NULL DEFAULT false,
  gap_days             INTEGER,
  logger_label         TEXT,
  logger_serial        TEXT,
  logger_launched_at   TIMESTAMPTZ,
  logger_downloaded_at TIMESTAMPTZ,
  rainfall_status      TEXT CHECK (rainfall_status IN ('pending', 'done', 'error')),
  rainfall_error       TEXT,
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visit_id, file_hash)
);


-- -------------------------------------------------------------
-- MANUAL READINGS
-- -------------------------------------------------------------
CREATE TABLE manual_readings (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER NOT NULL REFERENCES field_visits(id),
  reading_type  TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text    TEXT,
  unit          TEXT,
  recorded_at   TIMESTAMPTZ NOT NULL,
  notes         TEXT,
  UNIQUE (visit_id, reading_type)
);


-- -------------------------------------------------------------
-- PHENOMENA
-- -------------------------------------------------------------
CREATE TABLE phenomena (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  data_family  TEXT
    CHECK (data_family IN ('rainfall', 'groundwater', 'met', 'all')),
  unit         TEXT NOT NULL,
  measure      TEXT
    CHECK (measure IN ('sample', 'average', 'min', 'max', 'total', 'sd')),
  var_type     TEXT NOT NULL
    CHECK (var_type IN ('numeric', 'integer', 'text', 'datetime'))
);


-- -------------------------------------------------------------
-- STATION GAPS
-- Records periods between consecutive logger deployments where no
-- data was recorded. Recomputed in full after every file parse.
-- -------------------------------------------------------------
CREATE TABLE station_gaps (
  id          BIGSERIAL PRIMARY KEY,
  station_id  INTEGER NOT NULL REFERENCES stations(id),
  stream_id   INTEGER NOT NULL REFERENCES station_data_streams(id),
  gap_start   TIMESTAMPTZ NOT NULL,
  gap_end     TIMESTAMPTZ NOT NULL,
  gap_seconds INTEGER NOT NULL,
  gap_days    NUMERIC(6,1) NOT NULL,
  is_problem  BOOLEAN NOT NULL DEFAULT true,
  gap_type    TEXT NOT NULL DEFAULT 'missing' CHECK (gap_type IN ('missing', 'documented')),
  notes       TEXT,
  UNIQUE (stream_id, gap_start)
);
CREATE INDEX ON station_gaps (station_id, gap_start DESC);


-- -------------------------------------------------------------
-- RAW MEASUREMENTS
-- -------------------------------------------------------------
CREATE TABLE raw_measurements (
  id              BIGSERIAL PRIMARY KEY,
  file_id         INTEGER NOT NULL REFERENCES uploaded_files(id) ON DELETE CASCADE,
  stream_id       INTEGER NOT NULL REFERENCES station_data_streams(id),
  phenomenon_id   INTEGER NOT NULL REFERENCES phenomena(id),
  measured_at     TIMESTAMPTZ NOT NULL,
  value_numeric   NUMERIC,
  value_text      TEXT,
  is_interference BOOLEAN NOT NULL DEFAULT false,
  qa_flag         TEXT
    CHECK (qa_flag IN ('interfere', 'pseudo_event', 'double_tip')),
  flag_reason     TEXT
    CHECK (flag_reason IN ('1s_bounce', 'visit_proximity', 'manual_tip', 'non_rainfall_entry'))
  -- No UNIQUE constraint on (stream_id, phenomenon_id, measured_at): HOBO binary loggers
  -- record time at 1-minute resolution, so two genuine tips in the same minute produce
  -- identical timestamps. Uniqueness across re-uploads is enforced by delete-then-insert
  -- (see routes/files.js parseInBackground).
);
