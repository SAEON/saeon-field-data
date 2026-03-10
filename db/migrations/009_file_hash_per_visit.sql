-- =============================================================
-- 009_file_hash_per_visit.sql
-- Relaxes the global UNIQUE constraint on uploaded_files.file_hash
-- to a per-visit constraint (visit_id, file_hash).
--
-- Previously: one file hash could exist only once across all visits.
-- Now: the same physical file can be uploaded to multiple visits
--      (e.g. re-uploading a logger file on a follow-up visit),
--      but cannot be uploaded twice to the SAME visit.
-- =============================================================

-- Drop the global unique constraint
ALTER TABLE uploaded_files DROP CONSTRAINT uploaded_files_file_hash_key;

-- Add a per-visit unique constraint
ALTER TABLE uploaded_files
  ADD CONSTRAINT uploaded_files_visit_hash_key UNIQUE (visit_id, file_hash);
