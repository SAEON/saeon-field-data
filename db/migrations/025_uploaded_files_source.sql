ALTER TABLE uploaded_files
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual_upload'
    CHECK (source IN ('manual_upload', 'loggernet_auto', 'historic_import'));
