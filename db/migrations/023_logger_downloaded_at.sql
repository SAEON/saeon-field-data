-- Store the exact time the technician connected to the logger to download data.
--
-- logger_downloaded_at: timestamp of the Host Connected event (typeHi=0x1) in the
--                       HOBO binary data section — the true visit/download moment.
--                       A file may contain multiple connect events (multiple visits);
--                       we store the LAST one as it represents the most recent download.
--                       This column is the anchor for the ±10 min interfere window
--                       used by the rainfall processor to flag handling-noise tips.
ALTER TABLE uploaded_files
  ADD COLUMN logger_downloaded_at TIMESTAMPTZ;
