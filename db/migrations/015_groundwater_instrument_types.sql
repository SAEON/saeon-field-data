-- Expand instrument_history to support groundwater logger types.
-- Previously only 'raingauge' and 'datalogger' were permitted.

ALTER TABLE instrument_history DROP CONSTRAINT instrument_history_instrument_type_check;

ALTER TABLE instrument_history ADD CONSTRAINT instrument_history_instrument_type_check
  CHECK (instrument_type IN ('raingauge', 'datalogger', 'pressure_transducer', 'barologger'));
