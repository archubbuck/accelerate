# @accelerate/outbox-postgres

PostgreSQL storage for transactional outbox messages, publisher leases and consumer receipts. Apply the exported versioned `outboxMigration` through the Accelerate migrations runner before using the adapter. Configure a trusted schema search path on all connections.

```ts
import { enqueueOutbox, postgresOutbox, consumeOnce } from "@accelerate/outbox-postgres";
import { publishNext } from "@accelerate/outbox-core";

await db.transaction(async tx => {
  await tx.query("INSERT INTO orders (id) VALUES ($1)", [orderId]);
  await enqueueOutbox(tx, {
    id: eventId, type: "order.created", payload: { orderId },
    occurredAt: timestamp, correlationId: requestId,
  });
});

const store = postgresOutbox(db);
await publishNext(store, event => broker.send(event), {
  leaseMs: 30_000, retryDelayMs: 5_000, maxAttempts: 5,
});

await consumeOnce(db, "billing", receivedEvent, async (tx, event) => {
  await tx.query("INSERT INTO billing_events (id) VALUES ($1)", [event.id]);
});
```

Pass the active business transaction to `enqueueOutbox`. Duplicate event IDs raise a database error. A rollback discards both writes. Run the publisher outside the producer transaction using a pooled database executor. Claims use PostgreSQL time and row locks with `SKIP LOCKED`. Expiry allows another publisher to reclaim the same event. A fresh token fences stale acknowledgments, retries and dead-letter transitions.

A crash after broker acceptance can repeat delivery. `consumeOnce` atomically commits a named consumer's receipt with its local database effect, returns false for duplicates, and rolls both back on a handler error. External side effects require their own idempotency key. Receipts survive publisher cleanup. Keep them for the entire replay horizon and never reuse event IDs.

Use `store.redrive(eventId)` to return a dead-lettered event to pending with its attempt count reset. Repeated redrive returns false. `store.purgePublished(before, limit)` deletes a bounded batch of acknowledged events older than the cutoff and returns the number removed. Pending, leased and dead-lettered events remain recoverable.

Use a migration role for DDL. Producers need INSERT on the outbox. Publishers need SELECT and UPDATE, and retention workers also need DELETE. Consumers need INSERT on the receipt table and the privileges required for their own business writes.
