# @accelerate/locking-core

Lease ownership, fencing tokens, bounded contention waits and cancellation.

Inject a LockStore and Clock. Acquisition returns undefined on contention. waitForLease retries within a monotonic time budget. Zero timeout allows one attempt. Cancellation during acquisition waits for the request to settle and releases a newly acquired lease. Configure the database client's statement timeout separately to bound individual requests.

```ts
import { waitForLease } from "@accelerate/locking-core";
const lease = await waitForLease(store, clock, "export", workerId, 30000, { timeoutMs: 2000, retryMs: 50, signal });
if (lease) {
  try { await writeWithFence(lease.key, BigInt(lease.fence)); }
  finally { await store.release(lease); }
}
```

The protected resource must atomically reject writes bearing an older fence. Tokens compare numerically per key. A false renewal means that ownership was lost.
