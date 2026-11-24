# @accelerate/scheduler-core

In-memory interval scheduler driven by caller-invoked tick(). Missed intervals coalesce to the latest due slot. Job IDs are deterministic; distributed deduplication depends on the queue. Schedule state is not durable; use one scheduler owner or external coordination.

## Usage

```ts
import { Scheduler } from "@accelerate/scheduler-core";
const scheduler = new Scheduler(queue);
scheduler.register({ id: 'refresh', name: 'refresh', payload: {}, intervalMs: 60000, startAt: Date.now() });
await scheduler.tick();
```
