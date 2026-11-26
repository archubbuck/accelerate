# @accelerate/idempotency-postgres

Durable PostgreSQL claims, outcome replay and compare-and-set reconciliation.

Apply the schema with a migration role. Grant the runtime role SELECT, INSERT and UPDATE on accelerate_idempotency. Scope keys to the tenant and operation. Conditional upserts serialize concurrent claims. Completion and reconciliation check the fingerprint, token, state and lease expiry.

```ts
import { migrate } from "@accelerate/migrations-postgres";
import { postgresIdempotency, idempotencyMigration } from "@accelerate/idempotency-postgres";
await migrate(db, [idempotencyMigration]);
const store = postgresIdempotency(db);
const decision = await store.claim({ key: "tenant-7/export-1", fingerprint }, 30000);
```

An abandoned claim requires authoritative external reconciliation. A worker can crash between the external effect and local completion. Retain terminal outcomes for the full duplicate-request window. Expiry permits a fresh claim on the same key.
