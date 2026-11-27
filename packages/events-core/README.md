# @accelerate/events-core

Framework-neutral events contracts for Accelerate. This package does not provide persistence or vendor-specific integrations; implement the exported interfaces in an adapter.

Install with `npm install @accelerate/events-core`. See `src/index.ts` for the public contracts.

## Durable subscriptions

A journal stores a single ordered event history. Each consumer name owns an independent checkpoint. Cursor zero means the beginning. Cursors are opaque, increasing safe integers and may contain gaps. Use the returned cursor in the next call to `replay(after, limit)`. Replay reads history without changing delivery state. Append accepts JSON payloads, a positive schema version (default 1), and optional string correlation and causation IDs. The first append of a given event ID wins.

```ts
await journal.append({ id: "evt-42", type: "order.created", payload: { orderId: 42 },
  occurredAt: new Date().toISOString(), schemaVersion: 2, correlationId: "request-17" });
const delivery = await journal.claim("billing", 30_000);
if (delivery) {
  // Use the stable event ID to deduplicate the business effect before acknowledging.
  await applyOnce(delivery.event);
  const acknowledged = await journal.ack(delivery.receipt);
  if (!acknowledged) recordLostLease(delivery.event.id);
}
```

Each subscription delivers in append order with one active lease at a time. Different subscriptions can process concurrently. An empty claim also occurs during contention, retry delays, and dead-letter blocking. Poll again with backoff. An expired claim can be reclaimed and a stale receipt cannot advance the checkpoint. A crash after applying an effect but before acknowledgment can repeat delivery. Downstream effects must tolerate duplicates.

On a handler failure, call `nack(receipt, { maxAttempts, delayMs })`. Each successful claim increments the attempt count. A nack at the attempt limit parks the event and blocks later events on that subscription. Use `inspect(name)` to obtain the checkpoint, attempt, availability timestamp (Unix milliseconds), and dead cursor, then `replay(checkpoint, 1)` to inspect the event. `redrive(name, deadCursor)` clears the failure and resets its attempts. Ack, nack and redrive return false when their preconditions no longer hold. Storage errors reject. For telemetry, record the subscription, cursor, claim attempt, disposition, and correlation ID. Payloads and receipt tokens can contain sensitive data and should stay out of logs.
