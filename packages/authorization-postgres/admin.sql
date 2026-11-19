-- Additive migration for audited administrative mutations.
CREATE TABLE IF NOT EXISTS authorization_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('role.create', 'role.activate', 'role.deactivate', 'permission.grant', 'permission.revoke', 'role.assign', 'role.unassign')),
  target_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS authorization_audit_events_occurred_at_idx ON authorization_audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS authorization_audit_events_actor_idx ON authorization_audit_events (actor_id, occurred_at DESC);
