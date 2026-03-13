-- Migration 011 — Phase 2 schema additions
-- Adds display_name, initials, last_login to users
-- Adds visit_frequency_days, assigned_technician_id to stations

-- users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name       TEXT,
  ADD COLUMN IF NOT EXISTS initials           VARCHAR(2),
  ADD COLUMN IF NOT EXISTS last_login         TIMESTAMPTZ;

-- stations table
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS visit_frequency_days     INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS assigned_technician_id   INTEGER REFERENCES users(id) ON DELETE SET NULL;
