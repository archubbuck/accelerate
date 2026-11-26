import type {
  Database,
  QueryExecutor,
  Transaction,
} from "@accelerate/data-core";
import type { Migration } from "@accelerate/migrations-core";
import {
  validateInteger,
  type Delivery,
  type OutboxEvent,
  type PublisherStore,
} from "@accelerate/outbox-core";

export const outboxMigration: Migration = {
  id: "accelerate-outbox/1",
  statements: [
    `CREATE TABLE accelerate_outbox (
      id text PRIMARY KEY, envelope jsonb NOT NULL, status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','leased','published','dead')), attempt integer NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT clock_timestamp(), token uuid, published_at timestamptz)`,
    `CREATE INDEX accelerate_outbox_ready ON accelerate_outbox (available_at,id)
      WHERE status IN ('pending','leased')`,
    `CREATE INDEX accelerate_outbox_published ON accelerate_outbox (published_at,id) WHERE status='published'`,
    `CREATE TABLE accelerate_outbox_receipts (consumer text NOT NULL, event_id text NOT NULL,
      PRIMARY KEY (consumer,event_id))`,
  ],
};

function identifier(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 256)
    throw new TypeError("Invalid outbox identifier");
}

/** Use the transaction that is applying the business write. Duplicate IDs fail the transaction. */
export async function enqueueOutbox(
  tx: Transaction,
  event: OutboxEvent,
): Promise<void> {
  identifier(event.id);
  identifier(event.type);
  if (event.correlationId !== undefined) identifier(event.correlationId);
  if (
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt))
  )
    throw new TypeError("Invalid event timestamp");
  if (
    event.metadata !== undefined &&
    (!event.metadata ||
      typeof event.metadata !== "object" ||
      Array.isArray(event.metadata) ||
      Object.values(event.metadata).some((value) => typeof value !== "string"))
  ) {
    throw new TypeError("Invalid event metadata");
  }
  const { id, type, occurredAt, payload, correlationId, metadata } = event;
  const envelope = JSON.stringify(
    {
      id,
      type,
      occurredAt,
      payload,
      ...(correlationId !== undefined && { correlationId }),
      ...(metadata !== undefined && { metadata }),
    },
    (_key, value) => {
      if (
        value === undefined ||
        typeof value === "function" ||
        typeof value === "symbol" ||
        (typeof value === "number" && !Number.isFinite(value))
      )
        throw new TypeError("Invalid JSON event value");
      return value;
    },
  );
  await tx.query(
    "INSERT INTO accelerate_outbox (id,envelope) VALUES ($1,$2::jsonb)",
    [id, envelope],
  );
}

export interface PostgresOutbox extends PublisherStore {
  redrive(eventId: string): Promise<boolean>;
  purgePublished(before: Date, limit: number): Promise<number>;
}

export function postgresOutbox(db: QueryExecutor): PostgresOutbox {
  async function settle(
    delivery: Delivery,
    status: "published" | "dead" | "pending",
    delayMs = 0,
  ) {
    validateInteger(delayMs, 0, "retry delay");
    const result = await db.query(
      `UPDATE accelerate_outbox SET status=$3,token=NULL,
      available_at=clock_timestamp()+$4 * interval '1 millisecond',
      published_at=CASE WHEN $3='published' THEN clock_timestamp() END
      WHERE id=$1 AND token=$2 AND status='leased' AND available_at>clock_timestamp()`,
      [delivery.event.id, delivery.token, status, delayMs],
    );
    return result.rowCount === 1;
  }
  return {
    async claim(leaseMs) {
      validateInteger(leaseMs, 1, "lease");
      const result = await db.query<{
        envelope: OutboxEvent;
        token: string;
        attempt: number;
      }>(
        `WITH candidate AS (SELECT id FROM accelerate_outbox WHERE status IN ('pending','leased')
          AND available_at<=clock_timestamp() ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
         UPDATE accelerate_outbox o SET status='leased',token=$1,attempt=o.attempt+1,
          available_at=clock_timestamp()+$2 * interval '1 millisecond' FROM candidate
         WHERE o.id=candidate.id RETURNING o.envelope,o.token,o.attempt`,
        [crypto.randomUUID(), leaseMs],
      );
      const row = result.rows[0];
      return (
        row && { event: row.envelope, token: row.token, attempt: row.attempt }
      );
    },
    acknowledge: (delivery) => settle(delivery, "published"),
    retry: (delivery, delayMs) => settle(delivery, "pending", delayMs),
    deadLetter: (delivery) => settle(delivery, "dead"),
    async redrive(eventId) {
      identifier(eventId);
      const result = await db.query(
        `UPDATE accelerate_outbox SET status='pending', attempt=0,
        available_at=clock_timestamp() WHERE id=$1 AND status='dead'`,
        [eventId],
      );
      return result.rowCount === 1;
    },
    async purgePublished(before, limit) {
      validateInteger(limit, 1, "retention batch size");
      const result = await db.query(
        `WITH expired AS (SELECT id FROM accelerate_outbox
        WHERE status='published' AND published_at<$1 ORDER BY published_at,id LIMIT $2 FOR UPDATE SKIP LOCKED)
        DELETE FROM accelerate_outbox o USING expired WHERE o.id=expired.id`,
        [before.toISOString(), limit],
      );
      return result.rowCount;
    },
  };
}

/** Commit the receipt and local effect in the same database transaction. */
export function consumeOnce(
  db: Database,
  consumer: string,
  event: OutboxEvent,
  apply: (tx: Transaction, event: OutboxEvent) => Promise<void>,
) {
  identifier(consumer);
  identifier(event.id);
  return db.transaction(async (tx) => {
    const receipt = await tx.query(
      `INSERT INTO accelerate_outbox_receipts (consumer,event_id)
      VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [consumer, event.id],
    );
    if (!receipt.rowCount) return false;
    await apply(tx, event);
    return true;
  });
}
