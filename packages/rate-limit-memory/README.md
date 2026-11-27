# @accelerate/rate-limit-memory

In-process atomic quota storage for a single JavaScript isolate. Share one store across limiters. Restarting the process resets its quotas.

```ts
const store = createMemoryQuotaStore(clock);
const limiter = createRateLimiter(store, clock);
```

The injected clock controls expiry and makes tests deterministic. Access discards expired partitions. Call store.prune() periodically to reclaim idle partitions.
