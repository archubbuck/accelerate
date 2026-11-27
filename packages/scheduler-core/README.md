# @accelerate/scheduler-core

In-memory interval scheduler driven by caller-invoked tick(). Missed intervals coalesce to the latest due slot. Job IDs are deterministic; distributed deduplication depends on the queue. Schedule state is not durable; use one scheduler owner or external coordination.

## Usage

```ts
import { Scheduler } from "@accelerate/scheduler-core";
const scheduler = new Scheduler(queue);
scheduler.register({ id: 'refresh', name: 'refresh', payload: {}, intervalMs: 60000, startAt: Date.now() });
await scheduler.tick();
```

## Durable schedules

Use the pure planner to preview a schedule before registering it with the PostgreSQL adapter. All timestamps are integer Unix milliseconds. The start bound and preview cursor are inclusive.

```ts
import { upcoming, type ScheduleDefinition } from '@accelerate/scheduler-core';
const schedule: ScheduleDefinition = {
  id: 'weekday-report', startAt: Date.UTC(2026, 0, 1),
  zone: 'America/Chicago', excludeDates: ['2026-12-25'],
  timing: { kind: 'cron', expression: '30 8 * * MON-FRI' },
  missed: { kind: 'skip', graceMs: 300000 }, payload: { report: 'daily' }
};
const preview = upcoming(schedule, Date.now(), 5);
```

One-time schedules use `{kind:'once'}`. Intervals use `{kind:'interval',everyMs:60000}` and stay anchored to startAt in elapsed time. Five-field cron uses CronosJS syntax and evaluates wall time in the specified IANA zone (default UTC). By default a spring gap skips the missing occurrence and a fall overlap uses its first instant. Choose `gap:'offset'` to shift a missing time by the jump or `overlap:'both'` to produce two distinct runs. Calendar exclusions compare local YYYY-MM-DD dates for every timing kind.

Catch-up processes one eligible occurrence per tick, oldest first. Skip advances past the entire range older than the grace period and records that range in history. A subsequent tick can dispatch the oldest remaining eligible occurrence. At the grace boundary the slot is still eligible.
