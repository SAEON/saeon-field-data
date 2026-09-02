CREATE TABLE transfer_standards (
  id                   SERIAL PRIMARY KEY,
  kit_label            TEXT NOT NULL,
  manufacturer         TEXT NOT NULL,
  model                TEXT NOT NULL,
  serial_no            TEXT NOT NULL,
  parameters           TEXT[] NOT NULL,
  measurement_range    TEXT,
  accuracy             TEXT,
  certificate_number   TEXT,
  calibration_lab      TEXT DEFAULT 'NMISA',
  traceability_ref     TEXT,
  calibration_date     DATE,
  calibration_due_date DATE,
  status               TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'retired')),
  date_commissioned    DATE,
  date_retired         DATE,
  custodian_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kit_label, model, serial_no)
);

CREATE INDEX ON transfer_standards (kit_label);
CREATE INDEX ON transfer_standards (status) WHERE status = 'active';
CREATE INDEX ON transfer_standards (calibration_due_date);

INSERT INTO transfer_standards
  (kit_label, manufacturer, model, serial_no, parameters,
   measurement_range, accuracy, certificate_number, calibration_lab,
   calibration_date, calibration_due_date, status)
VALUES
  ('metcal1','Vaisala','HMP155','S1350155',ARRAY['temperature','humidity'],
   '-10 to +40°C / 0-100%','±0.17°C / 1.70%','NMISA-TEM-2025-9657','NMISA','2025-07-14','2026-08-31','active'),
  ('metcal1','Vaisala','PTB330','S1231054',ARRAY['pressure'],
   '500-1100 hPa','±0.15 hPa','NMISA-PRE-2025-9826','NMISA','2025-08-07','2026-08-31','active'),

  ('metcal2','Vaisala','HMP155','S1350154',ARRAY['temperature','humidity'],
   '-10 to +40°C / 0-100%','±0.17°C / 1.70%','NMISA-TEM-2025-9546','NMISA','2025-07-04','2026-08-31','active'),
  ('metcal2','Vaisala','PTB330','S1231053',ARRAY['pressure'],
   '500-1100 hPa','±0.15 hPa','NMISA-PRE-2025-9628','NMISA','2025-07-15','2026-08-31','active'),

  ('metcal3','Vaisala','HMP155','T3311062',ARRAY['temperature','humidity'],
   '-10 to +40°C / 0-100%','±0.17°C / 1.70%','NMISA-TEM-2025-10084','NMISA','2025-09-10','2026-08-31','active'),
  ('metcal3','Vaisala','PTB330','T3330359',ARRAY['pressure'],
   '500-1100 hPa','±0.15 hPa','NMISA-PRE-2025-9968','NMISA','2025-08-21','2026-08-31','active'),

  ('metcal4','Vaisala','HMP155','T3311064',ARRAY['temperature','humidity'],
   '-10 to +40°C / 0-100%','±0.17°C / 1.70%','NMISA-TEM-2025-9656','NMISA','2025-07-14','2026-08-31','active'),
  ('metcal4','Vaisala','PTB330','T3330361',ARRAY['pressure'],
   '500-1100 hPa','±0.15 hPa','NMISA-PRE-2025-9825','NMISA','2025-08-07','2026-08-31','active'),

  ('metcal5','Vaisala','HMP155','T3311063',ARRAY['temperature','humidity'],
   '-10 to +40°C / 0-100%','±0.17°C / 1.70%','NMISA-TEM-2025-10087','NMISA','2025-09-10','2026-08-31','active'),
  ('metcal5','Vaisala','PTB330','T3330360',ARRAY['pressure'],
   '500-1100 hPa','±0.15 hPa','NMISA-PRE-2025-9969','NMISA','2025-08-21','2026-08-31','active'),

  ('metcal6','Vaisala','HMP155','T3311061',ARRAY['temperature','humidity'],
   '-10 to +40°C / 0-100%','±0.17°C / 1.70%','NMISA-TEM-2025-9547','NMISA','2025-07-04','2026-08-31','active'),
  ('metcal6','Vaisala','PTB330','T3330358',ARRAY['pressure'],
   '500-1100 hPa','±0.15 hPa','NMISA-PRE-2025-9630','NMISA','2025-07-15','2026-08-31','active');
