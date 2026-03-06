-- =============================================================
-- 000_create_database.sql
-- Run this FIRST, connected to the default 'postgres' database.
-- psql -U postgres -f 000_create_db.sql
-- =============================================================

-- Create database only if it does not already exist
SELECT 'CREATE DATABASE fds'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'fds'
)\gexec

-- Then run all subsequent scripts against fds:
-- psql -U postgres -d fds -f 001_extensions.sql
-- psql -U postgres -d fds -f 002_tables.sql
-- psql -U postgres -d fds -f 003_indices.sql
-- psql -U postgres -d fds -f 004_seed.sql
