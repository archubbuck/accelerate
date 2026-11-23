CREATE TABLE IF NOT EXISTS accelerate_audit_events (
 id text PRIMARY KEY,
 occurred_at timestamptz NOT NULL,
 actor_id text,
 action text NOT NULL,
 resource text NOT NULL,
 resource_id text,
 outcome text NOT NULL CHECK (outcome IN ('success','failure')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS accelerate_audit_events_lookup_idx ON accelerate_audit_events(occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS accelerate_audit_events_actor_idx ON accelerate_audit_events(actor_id, occurred_at DESC);
