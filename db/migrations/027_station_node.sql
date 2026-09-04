ALTER TABLE stations ADD COLUMN node TEXT;
UPDATE stations SET node = 'Unknown' WHERE node IS NULL;
ALTER TABLE stations ALTER COLUMN node SET NOT NULL;
