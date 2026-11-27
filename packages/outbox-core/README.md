# @accelerate/outbox-core

A framework-neutral, single-delivery publisher for a transactional outbox. Supply a store and an asynchronous transport. Use a globally unique, stable event ID and a JSON payload. Optional correlation IDs and string metadata travel with each copy.

```ts
import { publishNext } from "@accelerate/outbox-core";

const result = await publishNext(store, event => broker.send(event), {
  leaseMs: 30_000,
  retryDelayMs: 5_000,
  maxAttempts: 5,
});
```

The transport should resolve after broker acceptance. Each invocation claims at most one event and returns an outcome suitable for counters and tracing. Non-idle outcomes include the event ID, optional correlation ID and attempt number. Use correlation IDs for traces and the low-cardinality status for metrics. Restrict metadata to values safe to send to every subscriber.

A rejected publish schedules another attempt or dead-letters the event when the claim count reaches the limit. A process crash leaves the lease available for recovery after expiration. A stale worker receives `lease-lost` when settling. Store errors propagate to the caller. Choose a lease that covers normal broker latency and back off polling when idle.

Delivery is **at least once**. The broker can accept a message even when its response is lost, and a worker can stop before recording acceptance. Both cases can produce duplicate copies. Parallel workers and retries can reorder events. Deduplicate on consumer name and event ID in the transaction performing the local effect.
