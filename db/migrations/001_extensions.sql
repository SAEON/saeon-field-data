-- =============================================================
-- 001_extensions.sql
-- Run this first. Enables required PostgreSQL extensions.
-- Requires superuser or rds_superuser privileges.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS postgis;       -- spatial types + functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid(), digest() for file hashing
