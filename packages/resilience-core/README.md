# @accelerate/resilience-core

resilience-core package for the Accelerate monorepo.

Install: `npm install @accelerate/resilience-core`.

Public API is exported from `src/index.ts`. Run `pnpm --filter @accelerate/resilience-core build` and `pnpm --filter @accelerate/resilience-core test` before publishing.

## Composed execution

```ts
import { bulkhead, circuitBreaker, executeResilient } from '@accelerate/resilience-core';

const capacity = bulkhead(8);
const breaker = circuitBreaker({ failures: 3, cooldownMs: 5000, counts: isTransient });
const result = await executeResilient(({ signal }) => readProduct(id, signal), {
  bulkhead: capacity,
  breaker,
  deadlineMs: 2000,
  retrySafety: 'idempotent',
  classify: error => isTransient(error) ? 'transient' : 'permanent',
  retryAfter: error => getRetryAfterHeader(error),
});
```

Share the guards across calls to the same dependency. The deadline and caller cancellation cover the entire execution. Each attempt acquires a bulkhead slot, then checks the breaker, then invokes the operation. Slots release when underlying work settles, including when the caller has already timed out. Backoff and fallback run outside the guards. The breaker opens after consecutive qualifying failures, admits one recovery probe after cooldown, and reopens on any probe failure.

Retries require explicit idempotency and transient classification. An unsafe mutation receives one attempt. Use idempotent mode for mutations only when the operation actually deduplicates repeated effects. A fallback runs once after terminal failure while budget remains and must independently preserve mutation safety. Local guard rejections go directly to fallback or the caller. Jitter samples from zero up to the capped exponential delay. A valid Retry-After delta or HTTP date is a lower bound, even above the cap. The deadline still bounds the wait.

Supply a Clock and random function for deterministic tests. Attempt, retry and fallback events expose attempt numbers and retry delay without including error data. Telemetry callback exceptions are isolated. Pass the provided AbortSignal to I/O so work can stop promptly. Existing callers can continue using the low-level retry helper with its original behavior.
