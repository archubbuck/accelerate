# @accelerate/scheduler-postgres

Durable schedules and run history for competing PostgreSQL workers. Apply the exported versioned `schedulerMigration` with the migrations runner. Create a scheduler with a transactional writer, for example the Accelerate outbox.

```ts
import { createPostgresScheduler } from '@accelerate/scheduler-postgres';
import { enqueueOutbox } from '@accelerate/outbox-postgres';

const scheduler = createPostgresScheduler(db, async (tx, run) => {
  await enqueueOutbox(tx, {
    id: run.id, type: 'report.due', payload: run.payload,
    occurredAt: new Date(run.scheduledAt).toISOString(), correlationId: run.scheduleId
  });
});
await scheduler.register({
  id: 'reports', startAt: Date.now(), timing: {kind: 'interval', everyMs: 60000},
  missed: {kind: 'catch-up'}, payload: {report: 'daily'}
});
await scheduler.tick();
const next = await scheduler.upcoming('reports', 3);
const history = await scheduler.history('reports', -1, 20);
```

Each tick locks one due schedule using database time and SKIP LOCKED. The writer must perform only transactional database work on the supplied transaction. The handoff, logical run ID, history record and next cursor commit together. A worker failure before commit rolls all of them back. A fresh worker can retry. Deliver external effects through an outbox consumer using the deterministic run ID for idempotency. Multiple schedules can progress concurrently. Back off on an idle tick.

Registration with the same ID and JSON definition is idempotent and preserves progress. Conflicting definitions reject. Use a new ID to replace a schedule. Pause preserves the cursor, resume applies the configured missed-run policy, and cancellation is terminal. Control operations serialize with a tick on that schedule. Inspect returns stored state; upcoming returns eligible slots for active schedules. History is ordered by scheduled epoch milliseconds with an exclusive cursor. A null run ID and skippedBefore record the skipped half-open range. Schedule IDs correlate history with downstream jobs.

Use a migration role for DDL and a trusted schema search path. Workers need SELECT, INSERT and UPDATE on schedules, SELECT and INSERT on history and privileges for their transactional writer. Restrict inspection to authorized callers because schedule definitions contain payloads.
