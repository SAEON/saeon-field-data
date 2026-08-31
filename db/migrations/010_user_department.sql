-- Add department column to users table.
-- Nullable — existing users will have NULL until updated via User Management.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department TEXT;
