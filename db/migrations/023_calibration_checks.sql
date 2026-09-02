CREATE TABLE calibration_checks (
  id                                SERIAL PRIMARY KEY,
  visit_id                          INTEGER NOT NULL REFERENCES field_visits(id) ON DELETE CASCADE,
  station_sensor_id                 INTEGER NOT NULL REFERENCES station_sensors(id),
  transfer_standard_id              INTEGER NOT NULL REFERENCES transfer_standards(id),
  parameter                         TEXT NOT NULL
    CHECK (parameter IN ('temperature', 'humidity', 'pressure')),
  calibration_date                  DATE NOT NULL,
  calibration_method                TEXT NOT NULL DEFAULT 'Field verification',
  transfer_std_reading              NUMERIC,
  sensor_reading                    NUMERIC,
  as_found_error                    NUMERIC,
  within_tolerance                  BOOLEAN,
  correction_applied                BOOLEAN NOT NULL DEFAULT false,
  offset_applied                    NUMERIC,
  station_reading_post_cal          NUMERIC,
  transfer_std_verification_reading NUMERIC,
  as_left_error                     NUMERIC,
  post_cal_within_tolerance         BOOLEAN,
  certificate_issued                BOOLEAN,
  certificate_number                TEXT,
  technician_id                     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  remarks                           TEXT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON calibration_checks (visit_id);
CREATE INDEX ON calibration_checks (station_sensor_id);
CREATE INDEX ON calibration_checks (calibration_date);
