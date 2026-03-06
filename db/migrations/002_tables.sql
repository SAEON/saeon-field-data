-- =============================================================
-- 002_tables.sql
-- Run second. Creates all tables in dependency order.
-- =============================================================


-- -------------------------------------------------------------
-- STATIONS
-- -------------------------------------------------------------
CREATE TABLE stations (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  data_family     TEXT NOT NULL
    CHECK (data_family IN ('rainfall', 'groundwater', 'met')),
  region          TEXT,
  location        GEOGRAPHY(POINT, 4326),
  elevation_m     NUMERIC,
  active          BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    CHECK (role IN ('technician', 'manager', 'researcher')),

  -- Set auth_provider based on what you end up using:
  --   'microsoft' = Azure AD / Microsoft 365 (preferred - SAEON is on Microsoft)
  --   'keycloak'  = self-hosted Keycloak (good open source fallback)
  --   'local'     = simple JWT fallback for development/testing only
  auth_provider     TEXT NOT NULL DEFAULT 'microsoft'
    CHECK (auth_provider IN ('microsoft', 'keycloak', 'local')),

  -- Unique ID from the auth provider.
  -- Microsoft : Azure AD Object ID  (the 'oid' claim in the JWT)
  -- Keycloak  : subject ID          (the 'sub' claim in the JWT)
  -- Local     : a UUID generated at user creation time
  auth_provider_id  TEXT UNIQUE,

  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -------------------------------------------------------------
-- FIELD VISITS
-- -------------------------------------------------------------
CREATE TABLE field_visits (
  id              SERIAL PRIMARY KEY,
  station_id      INTEGER NOT NULL REFERENCES stations(id),
  technician_id   INTEGER NOT NULL REFERENCES users(id),
  visited_at      TIMESTAMPTZ NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'complete', 'flagged'))
);


-- -------------------------------------------------------------
-- UPLOADED FILES
-- -------------------------------------------------------------
CREATE TABLE uploaded_files (
  id               SERIAL PRIMARY KEY,
  visit_id         INTEGER NOT NULL REFERENCES field_visits(id),
  original_name    TEXT NOT NULL,
  file_hash        TEXT NOT NULL UNIQUE,
  file_size_bytes  INTEGER,
  storage_path     TEXT NOT NULL,
  file_format      TEXT NOT NULL
    CHECK (file_format IN ('hobo_csv', 'solonist_xle', 'campbell_toa5', 'generic_csv')),
  date_range_start TIMESTAMPTZ,
  date_range_end   TIMESTAMPTZ,
  record_count     INTEGER,
  parse_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (parse_status IN ('pending', 'parsed', 'error')),
  parse_error      TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -------------------------------------------------------------
-- MANUAL READINGS
-- -------------------------------------------------------------
CREATE TABLE manual_readings (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER NOT NULL REFERENCES field_visits(id),
  reading_type  TEXT NOT NULL
    CHECK (reading_type IN (
      'dipper_depth',
      'battery_voltage',
      'water_colour',
      'site_condition',
      'other'
    )),
  value_numeric NUMERIC,
  value_text    TEXT,
  unit          TEXT,
  recorded_at   TIMESTAMPTZ NOT NULL,
  notes         TEXT
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
-- RAW MEASUREMENTS
-- -------------------------------------------------------------
CREATE TABLE raw_measurements (
  id              BIGSERIAL PRIMARY KEY,
  file_id         INTEGER NOT NULL REFERENCES uploaded_files(id),
  stream_id       INTEGER NOT NULL REFERENCES station_data_streams(id),
  phenomenon_id   INTEGER NOT NULL REFERENCES phenomena(id),
  measured_at     TIMESTAMPTZ NOT NULL,
  value_numeric   NUMERIC,
  value_text      TEXT,
  is_interference BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (stream_id, phenomenon_id, measured_at)
);
