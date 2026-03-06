-- =============================================================
-- 003_indices.sql
-- Run third. Performance indices on commonly queried columns.
-- =============================================================


-- stations
CREATE INDEX idx_stations_location   ON stations USING GIST(location);  -- spatial queries
CREATE INDEX idx_stations_family     ON stations(data_family);
CREATE INDEX idx_stations_active     ON stations(active);

-- station_data_streams
CREATE INDEX idx_streams_station     ON station_data_streams(station_id);

-- field_visits
CREATE INDEX idx_visits_station      ON field_visits(station_id);
CREATE INDEX idx_visits_technician   ON field_visits(technician_id);
CREATE INDEX idx_visits_visited_at   ON field_visits(visited_at DESC);
CREATE INDEX idx_visits_status       ON field_visits(status);

-- uploaded_files
CREATE INDEX idx_files_visit         ON uploaded_files(visit_id);
CREATE INDEX idx_files_parse_status  ON uploaded_files(parse_status);
CREATE INDEX idx_files_date_range    ON uploaded_files(date_range_start, date_range_end);

-- manual_readings
CREATE INDEX idx_readings_visit      ON manual_readings(visit_id);
CREATE INDEX idx_readings_type       ON manual_readings(reading_type);

-- raw_measurements — most performance-critical table
CREATE INDEX idx_meas_stream_time    ON raw_measurements(stream_id, measured_at DESC);
CREATE INDEX idx_meas_file           ON raw_measurements(file_id);
CREATE INDEX idx_meas_phenomenon     ON raw_measurements(phenomenon_id);
CREATE INDEX idx_meas_interference   ON raw_measurements(is_interference) WHERE is_interference = true;
