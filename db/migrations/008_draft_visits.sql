-- =============================================================
-- 008_draft_visits.sql
-- Enables persistent draft visits:
--   1. submitted_at becomes nullable (NULL for drafts, set on submission)
--   2. visited_at defaults to NOW() (allows draft creation before time is confirmed)
--   3. status CHECK expanded to include 'draft' and 'submitted'
-- =============================================================

-- Make submitted_at nullable (was NOT NULL DEFAULT NOW())
ALTER TABLE field_visits
  ALTER COLUMN submitted_at DROP NOT NULL,
  ALTER COLUMN submitted_at DROP DEFAULT;

-- Allow visited_at to default to NOW() so draft creation needs no timestamp
ALTER TABLE field_visits
  ALTER COLUMN visited_at SET DEFAULT NOW();

-- Expand status values to cover the full lifecycle
ALTER TABLE field_visits DROP CONSTRAINT field_visits_status_check;
ALTER TABLE field_visits ADD CONSTRAINT field_visits_status_check
  CHECK (status IN ('draft', 'pending', 'submitted', 'approved', 'flagged'));

-- Set default status to 'draft' (previously 'pending')
ALTER TABLE field_visits ALTER COLUMN status SET DEFAULT 'draft';
