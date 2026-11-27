export const EVENTS_SCHEMA = "CREATE TABLE IF NOT EXISTS accelerate_events (id text PRIMARY KEY, type text NOT NULL, payload jsonb NOT NULL, occurred_at timestamptz NOT NULL)";
