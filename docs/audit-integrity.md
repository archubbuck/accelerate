# Audit integrity verification

Use `@accelerate/identity/audit/postgres/integrity` for a PostgreSQL audit chain. Apply `auditIntegritySchema` through the application migration runner. Existing audit stores remain usable for events that do not use a hash chain.

```ts
import { createPostgresIntegrityAuditStore } from '@accelerate/identity/audit/postgres/integrity';

const audit = createPostgresIntegrityAuditStore(db);
await db.transaction(async tx => {
  await persistOrder(tx, order);
  await audit.bind(tx).append('orders', {
    id: eventId, occurredAt: new Date(), actorId: workerId, actorKind: 'service',
    action: 'order.saved', resource: 'order', resourceId: order.id,
    outcome: 'success', correlationId: requestId, causationId: jobId,
  });
});

const checkpoint = await audit.checkpoint('orders');
await independentCheckpointStore.put(checkpoint);
const result = await audit.verify('orders', checkpoint);
```

Append order defines the sequence. The store serializes writers per stream, and an aborted business transaction rolls back its audit append. Keep passwords, tokens, and sensitive payloads out of the metadata. Use a stable stream for related actions. For transactions that append to several streams, acquire them in a consistent order.

Read or export batches with `page(stream, { after, through, limit, action, resource })`. Capture the head sequence as `through` to export a fixed range, and use the last returned sequence as the next cursor. Full chain verification reads against one database snapshot and returns the first broken link or a head or checkpoint mismatch.

Grant the app writer SELECT, INSERT, and the minimum UPDATE access needed on chain heads. Keep chain rows and event ID reservations append-only for normal writers. Use a separate retention role for `createPostgresAuditRetention(db).prune(checkpoint)`. Export and verify records first, then supply a checkpoint copied from independent storage. Retention preserves the checkpoint and ID reservations.

The SHA-256 chain detects changes to linked records when verified against a trusted checkpoint. A privileged database administrator who can rewrite the rows and the head can rebuild an unanchored chain. Store trusted checkpoints outside the audit database under separate access controls if that risk matters to the application.
