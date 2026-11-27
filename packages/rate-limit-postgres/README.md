# @accelerate/rate-limit-postgres

Apply the exported quotaMigration with the Accelerate migrations runner. Pass a pooled Accelerate Database to createPostgresQuotaStore. Workers sharing a partition serialize on its database row and evaluate all scopes against database time. A failed transaction rolls its charges back. A fresh worker reads committed quotas and leases.

```ts
const store = createPostgresQuotaStore(db);
const limiter = createRateLimiter(store);
await store.prune(100);
```

Expired quotas become available independently of cleanup. Prune removes a bounded batch of idle rows and skips locked partitions. Use a trusted schema search path, a separate migration role, and SELECT, INSERT, UPDATE and DELETE privileges on accelerate_quotas for workers. Keep each partition small enough to update in one transaction.
