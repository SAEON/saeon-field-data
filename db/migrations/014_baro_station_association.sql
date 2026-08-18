-- Link each level logger station to the barologger station that compensates it.
-- Barologger stations have baro_station_id = NULL.
-- Both level logger and barologger stations are rows in stations (data_family = 'groundwater').

ALTER TABLE stations ADD COLUMN baro_station_id INTEGER REFERENCES stations(id);

CREATE INDEX idx_stations_baro ON stations(baro_station_id) WHERE baro_station_id IS NOT NULL;
