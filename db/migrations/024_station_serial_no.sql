-- Lightweight instrument traceability at station level.
-- Manually entered by the data manager — not a deployment record.
-- Seed data for a future instruments registry.
ALTER TABLE stations ADD COLUMN serial_no TEXT;
