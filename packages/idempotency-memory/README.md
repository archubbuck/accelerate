# @accelerate/idempotency-memory

Process-local atomic claims, replay, expiry and explicit reconciliation.

Share one instance among local callers. Results are copied on settlement and replay. State is volatile and retained per key. Inject a manual clock for deterministic tests.

```ts
import { memoryIdempotency } from "@accelerate/idempotency-memory";
import { manualClock } from "@accelerate/time-core";
const clock = manualClock(new Date(0));
const store = memoryIdempotency(clock);
const decision = await store.claim({ key: "sync/1", fingerprint: "digest" }, 5000);
```
