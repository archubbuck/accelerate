CREATE TABLE IF NOT EXISTS accelerate_identities (
  id text PRIMARY KEY,
  email text UNIQUE,
  display_name text
);
CREATE UNIQUE INDEX IF NOT EXISTS accelerate_identities_email_lower_idx ON accelerate_identities (lower(email));
CREATE TABLE IF NOT EXISTS accelerate_sessions (
  id text PRIMARY KEY,
  identity_id text NOT NULL REFERENCES accelerate_identities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT accelerate_sessions_valid_expiry CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS accelerate_sessions_expiry_idx ON accelerate_sessions(expires_at);
