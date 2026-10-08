ALTER TABLE uploaded_files
  ADD COLUMN has_overlap  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN overlap_days NUMERIC;
