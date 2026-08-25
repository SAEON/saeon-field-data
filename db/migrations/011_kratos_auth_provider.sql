-- Add 'kratos' as a valid auth_provider value.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_auth_provider_check;

ALTER TABLE users
  ADD CONSTRAINT users_auth_provider_check
  CHECK (auth_provider IN ('microsoft', 'keycloak', 'kratos', 'local'));
