import {
  createEventJournal,
  initialSubscription,
  type SubscriptionState,
} from "@accelerate/events-core";
import type { Database } from "@accelerate/data-core";
import type { Migration } from "@accelerate/migrations-core";
import { EVENTS_SCHEMA } from "./schema.js";

/** Apply atomically through migrations-postgres; existing IDs and legacy writers are preserved. */
export const eventJournalMigration: Migration = {
  id: "accelerate-events/1",
  statements: [
    EVENTS_SCHEMA,
    "ALTER TABLE accelerate_events ADD COLUMN cursor bigint, ADD COLUMN schema_version integer NOT NULL DEFAULT 1, ADD COLUMN correlation_id text, ADD COLUMN causation_id text",
    `WITH history AS (SELECT id,row_number() OVER (ORDER BY occurred_at,id) AS position FROM accelerate_events)
    UPDATE accelerate_events e SET cursor=history.position FROM history WHERE e.id=history.id`,
    "ALTER TABLE accelerate_events ALTER COLUMN cursor SET NOT NULL, ADD UNIQUE (cursor)",
    "CREATE TABLE accelerate_event_sequence (singleton boolean PRIMARY KEY CHECK(singleton), position bigint NOT NULL CHECK(position BETWEEN 0 AND 9007199254740991))",
    "INSERT INTO accelerate_event_sequence SELECT true,COALESCE(MAX(cursor),0) FROM accelerate_events",
    `CREATE FUNCTION accelerate_assign_event_cursor() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN UPDATE accelerate_event_sequence SET position=position+1 WHERE singleton RETURNING position INTO NEW.cursor; RETURN NEW; END; $$`,
    "CREATE TRIGGER accelerate_event_cursor BEFORE INSERT ON accelerate_events FOR EACH ROW EXECUTE FUNCTION accelerate_assign_event_cursor()",
    "CREATE TABLE accelerate_event_subscriptions (name text PRIMARY KEY, revision bigint NOT NULL, state jsonb NOT NULL)",
  ],
};
export function createPostgresEventJournal(db: Database) {
  return createEventJournal({
    async append(event) {
      await db.query(
        `INSERT INTO accelerate_events (id,type,payload,occurred_at,schema_version,correlation_id,causation_id)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.type,
          JSON.stringify(event.payload),
          event.occurredAt,
          event.schemaVersion,
          event.correlationId ?? null,
          event.causationId ?? null,
        ],
      );
    },
    async read(after, limit) {
      const { rows } = await db.query<{
        cursor: string;
        id: string;
        type: string;
        payload: unknown;
        occurred_at: Date | string;
        schema_version: number;
        correlation_id: string | null;
        causation_id: string | null;
      }>(
        "SELECT cursor,id,type,payload,occurred_at,schema_version,correlation_id,causation_id FROM accelerate_events WHERE cursor>$1 ORDER BY cursor LIMIT $2",
        [after, limit],
      );
      return rows.map((row) => ({
        cursor: Number(row.cursor),
        event: {
          id: row.id,
          type: row.type,
          payload: row.payload,
          occurredAt: new Date(row.occurred_at).toISOString(),
          schemaVersion: row.schema_version,
          ...(row.correlation_id !== null && {
            correlationId: row.correlation_id,
          }),
          ...(row.causation_id !== null && { causationId: row.causation_id }),
        },
      }));
    },
    async load(name) {
      const {
        rows: [row],
      } = await db.query<{
        now: string;
        revision: string | null;
        state: SubscriptionState | null;
      }>(
        `SELECT floor(extract(epoch from clock_timestamp())*1000)::bigint AS now,s.revision,s.state
         FROM (VALUES (1)) AS anchor(i) LEFT JOIN accelerate_event_subscriptions s ON s.name=$1`,
        [name],
      );
      return {
        now: Number(row.now),
        revision: Number(row.revision ?? 0),
        state: row.state ?? initialSubscription(),
      };
    },
    async swap(name, revision, state, deadline) {
      return db.transaction(
        async (tx) => {
          if (revision === 0)
            await tx.query(
              "INSERT INTO accelerate_event_subscriptions VALUES ($1,0,$2::jsonb) ON CONFLICT DO NOTHING",
              [name, JSON.stringify(initialSubscription())],
            );
          // Lock before evaluating the time fence, including after waiting for a competing worker.
          await tx.query(
            "SELECT name FROM accelerate_event_subscriptions WHERE name=$1 FOR UPDATE",
            [name],
          );
          const result = await tx.query(
            `UPDATE accelerate_event_subscriptions SET revision=revision+1,state=$3::jsonb
          WHERE name=$1 AND revision=$2 AND ($4::bigint IS NULL OR extract(epoch from clock_timestamp())*1000<$4)`,
            [name, revision, JSON.stringify(state), deadline ?? null],
          );
          return result.rowCount === 1;
        },
        { isolationLevel: "read committed" },
      );
    },
  });
}
