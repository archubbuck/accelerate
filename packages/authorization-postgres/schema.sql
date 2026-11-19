-- Apply this migration before using PostgresAuthorizationStore.
CREATE TABLE IF NOT EXISTS authorization_roles (
  id text PRIMARY KEY,
  role_key text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS authorization_role_permissions (
  role_id text NOT NULL REFERENCES authorization_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);
CREATE TABLE IF NOT EXISTS authorization_user_roles (
  user_id text NOT NULL,
  role_id text NOT NULL REFERENCES authorization_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS authorization_user_roles_role_idx ON authorization_user_roles(role_id);
