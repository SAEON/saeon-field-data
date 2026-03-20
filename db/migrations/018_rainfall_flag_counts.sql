-- 018_rainfall_flag_counts.sql
-- Add per-flag-type tip counts to the rainfall aggregate table.
-- Allows the dashboard to show WHY tips were rejected, not just that they were.

ALTER TABLE rainfall
  ADD COLUMN double_tip_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN interfere_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN pseudo_event_count INTEGER NOT NULL DEFAULT 0;
