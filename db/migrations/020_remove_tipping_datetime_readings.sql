-- Remove manual tipping datetime readings replaced by instrument timestamp approach.
-- event_start_dt and event_end_dt are no longer captured from the technician;
-- the pseudo-event window is now derived from the HOBO file's date_range_end.
DELETE FROM manual_readings
WHERE reading_type IN ('event_start_dt', 'event_end_dt');
