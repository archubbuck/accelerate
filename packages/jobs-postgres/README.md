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
  heartbeatMs: 10000,
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
- A heartbeat extends active leases while a handler runs. Set `heartbeatMs` below `leaseMs`; network partitions, blocked event loops, or database failures can still cause lease loss and duplicate execution.
- A lost lease prevents the worker from intentionally acknowledging completion, but it cannot undo external side effects. Handlers must remain idempotent.
- `stop()` aborts the worker signal but cannot forcibly terminate a handler that ignores it.
- Run schema migrations before deploying this package; the schema is not automatically applied.

Source presence does not imply publication to npm.

## Database-free validation

No PostgreSQL server, Docker container, or connection string is required for behavioral tests:

```ts
import { createMemoryJobsDatabase } from "@accelerate/jobs-postgres/testing";
import { createPostgresJobQueue, createPostgresJobWorker } from "@accelerate/jobs-postgres";

const database = createMemoryJobsDatabase(Date.now());
await createPostgresJobQueue(database).enqueue("example", { value: 1 }, { id: "job-1" });
const worker = createPostgresJobWorker(database, { workerId: "test-worker" });
worker.register("example", async job => { console.log(job.payload); });
await worker.start();
await worker.stop();
```

Run `pnpm --filter @accelerate/jobs-postgres test` to execute the package's tests. The in-memory adapter simulates **only the SQL statements used by this package**, with controlled time advancement and fail-fast handling of unsupported statements. It is intended for unit and behavioral testing, **not production persistence**.

This simulation verifies scheduling, worker behavior, claim exclusivity, and lease expiration, but **does not verify PostgreSQL SQL syntax, real transaction isolation, lock contention, or driver behavior**. A separate embedded PostgreSQL or real PostgreSQL compatibility suite is needed to establish those guarantees.
