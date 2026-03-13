-- Migration 012 — Phase 2: update role constraint + field_visits additions
-- Run after 011.
-- Safe to re-run (IF NOT EXISTS / IF EXISTS guards throughout).

-- -------------------------------------------------------------
-- 1. Update users.role CHECK to match Keycloak role names.
--    Old values: 'technician', 'manager', 'researcher'
--    New values: 'technician', 'technician_lead', 'data_manager'
-- -------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Migrate any existing rows that used the old role names
UPDATE users SET role = 'data_manager'    WHERE role = 'manager';
UPDATE users SET role = 'technician_lead' WHERE role = 'researcher';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('technician', 'technician_lead', 'data_manager'));

-- -------------------------------------------------------------
-- 2. field_visits — assigned_technician_id
--    Set by Sue when she assigns an upcoming visit to a technician.
--    NULL = unassigned.
-- -------------------------------------------------------------
ALTER TABLE field_visits
  ADD COLUMN IF NOT EXISTS assigned_technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
