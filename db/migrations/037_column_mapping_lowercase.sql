WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(raw_name)
           ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, id DESC
         ) AS rn
  FROM column_name_mappings
)
DELETE FROM column_name_mappings
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE column_name_mappings SET raw_name = LOWER(raw_name);
