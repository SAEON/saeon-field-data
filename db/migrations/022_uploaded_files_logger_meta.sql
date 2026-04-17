-- Surface HOBO binary logger metadata to uploaded_files.
--
-- logger_label:      Station label programmed into the logger (HOBOware tag 0x0a).
--                    Used for station search and cross-reference.
-- logger_serial:     Instrument serial number (tag 0x06). Used for equipment tracking.
-- logger_launched_at: When the logger was deployed/configured in the field (tag 0x07).
--                    This is the START of the recording window, not the download time.
ALTER TABLE uploaded_files
  ADD COLUMN logger_label       TEXT,
  ADD COLUMN logger_serial      TEXT,
  ADD COLUMN logger_launched_at TIMESTAMPTZ;

CREATE INDEX ON uploaded_files (logger_label);
CREATE INDEX ON uploaded_files (logger_serial);
