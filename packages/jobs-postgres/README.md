# @accelerate/jobs-postgres

PostgreSQL-backed job enqueueing and polling workers using the `@accelerate/jobs-core` contracts.

## Setup

Execute the exported `JOBS_SCHEMA` using a controlled database migration. Supply a `@accelerate/data-core` database query adapter; this package does not open its own connections.

```ts
import { createPostgresJobQueue, createPostgresJobWorker } from "@accelerate/jobs-postgres";

const queue = createPostgresJobQueue(database);
await queue.enqueue("send-email", { recipientId: "123" }, { delayMs: 500 });

const worker = createPostgresJobWorker(database, {
  workerId: "worker-1",
  pollIntervalMs: 1000,
  leaseMs: 30000,
  maxAttempts: 5,
  onError: (error, job) => console.error(job.id, error)
});
worker.register("send-email", async job => {
  // Use an idempotency key to avoid duplicate side effects.
  console.log(job.payload);
});
await worker.start();
// During shutdown:
await worker.stop();
```

## Delivery semantics and limitations

- Jobs are atomically claimed with PostgreSQL `FOR UPDATE SKIP LOCKED`.
- Failed attempts are retried after a delay until `maxAttempts`; exhausted jobs are marked `failed`.
- Workers can reclaim expired leases after a crash.
- Delivery is **at least once**, not exactly once. Make handlers idempotent.
- **Lease renewal is not yet implemented**. Handlers must complete before `leaseMs`, or another worker may reclaim the same job.
- `stop()` aborts the worker signal but cannot forcibly terminate a handler that ignores it.
- Run schema migrations before deploying this package; the schema is not automatically applied.

Source presence does not imply publication to npm.
