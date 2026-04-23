ALTER TABLE uploaded_files
  ADD COLUMN IF NOT EXISTS rainfall_status TEXT CHECK (rainfall_status IN ('pending', 'done', 'error')),
  ADD COLUMN IF NOT EXISTS rainfall_error  TEXT;
