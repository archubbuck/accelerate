# @accelerate/locking-memory

Process-local leases with injected time and monotonically increasing fencing tokens.

Create one store per coordination domain. Its state lasts for the life of that instance. Use manualClock for deterministic expiry tests.

```ts
import { memoryLocks } from "@accelerate/locking-memory";
import { manualClock } from "@accelerate/time-core";
const clock = manualClock(new Date(0));
const store = memoryLocks(clock);
const lease = await store.acquire("report", "worker", 1000);
clock.advance(1000);
```
