# @accelerate/rate-limit-core

Atomically apply weighted quotas across named scopes within a partition. Inject a memory, PostgreSQL or Redis store and optionally a Clock for waits.

```ts
import { createRateLimiter, rateLimitMiddleware } from '@accelerate/rate-limit-core';
const limiter = createRateLimiter(store);
const demand = {
  partition: 'tenant:42',
  rules: [
    {scope:'tenant', algorithm:'token-bucket', limit:100, periodMs:60000, cost:2},
    {scope:'user:7', algorithm:'concurrency', limit:3, periodMs:30000}
  ]
} as const;
const decision = await limiter.acquire(demand, {waitMs:250, signal});
if (decision.allowed) {
  try { await processRequest(); }
  finally { if (decision.permit) await limiter.release(decision.permit); }
}
const middleware = rateLimitMiddleware(limiter, request => authorizedDemand(request));
```

Each partition has an independent ledger. Requests sharing a quota must use the same partition and scope. Select both from authenticated context. Keep rule policies under application control and use versioned scope names when changing an active policy. All rules pass together. A rejection consumes nothing. A successful admission charges the configured costs even if downstream work later fails. Repeating a consume after an ambiguous transport error can charge twice.

| Algorithm | Meaning of limit and periodMs |
| --- | --- |
| token-bucket | Full starting capacity, with limit tokens refilled continuously per period |
| sliding-window | Maximum weight in the preceding period, with charges expiring individually |
| fixed-window | Maximum weight per UTC epoch-aligned period |
| concurrency | Maximum active weight, with each permit expiring one period after admission |

Costs and limits are positive integers up to 10,000. Periods are 1–2,147,483,647 ms. A request accepts up to 64 unique scopes. The decision reports remaining whole units, the epoch millisecond when each quota would be fully available without new consumption, and the longest retry delay needed across rejected rules. Early permit release can shorten the delay. Permit release is idempotent. Long-running work must finish within its lease or independently fence downstream writes.

Consume rejects immediately when capacity is exhausted. Acquire can wait until a deadline and supports AbortSignal. Cancellation interrupts waits. An in-flight store operation settles before cancellation is reported and a granted concurrency permit is released. The HTTP middleware returns 429 and Retry-After in whole seconds, and releases permits after the downstream handler settles. Store failures propagate to the caller. Use the decision and application request ID for metrics and traces. Treat permit tokens as private.

Agents can run the packaged read-only operation `rate-limit.preview` with `rules` and an ordered array of epoch-millisecond `times`. It returns one decision per timestamp starting from an empty partition, with remaining quota and retry timing. Repeating the preview with the same input produces the same output.
