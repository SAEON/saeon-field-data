-- Tag 0x07 in the HOBO binary header is the LAUNCH timestamp (when the logger
-- was configured and started recording), not the download time.
-- Rename to logger_launched_at to reflect the correct semantics.
ALTER TABLE uploaded_files
  RENAME COLUMN downloaded_at TO logger_launched_at;
