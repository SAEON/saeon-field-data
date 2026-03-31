-- Surface HOBO binary metadata to uploaded_files.
-- logger_label: station label set in HOBOware (tag 0x0a) — used for station search/cross-reference.
-- logger_serial: instrument serial number (tag 0x06) — used for equipment tracking.
-- downloaded_at: exact download timestamp from logger (tag 0x07) — replaces date_range_end
--               as the pseudo-event window anchor (more precise: this IS the visit moment).
ALTER TABLE uploaded_files
  ADD COLUMN logger_label  TEXT,
  ADD COLUMN logger_serial TEXT,
  ADD COLUMN downloaded_at TIMESTAMPTZ;

CREATE INDEX ON uploaded_files (logger_label);
CREATE INDEX ON uploaded_files (logger_serial);