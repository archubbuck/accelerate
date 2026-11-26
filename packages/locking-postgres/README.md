# @accelerate/locking-postgres

Atomic PostgreSQL lease acquisition, renewal, release and expiry recovery.

Apply the exported manifest before using the store. Give runtime callers SELECT, INSERT and UPDATE on accelerate_locks. Keep released rows to preserve per-key fencing counters. Each acquisition uses database time and a single conditional upsert. Use an autocommit executor so a successful return corresponds to a committed acquisition.

```ts
import { migrate } from "@accelerate/migrations-postgres";
import { postgresLocks, lockMigration } from "@accelerate/locking-postgres";
await migrate(db, [lockMigration]);
const lease = await postgresLocks(db).acquire("report", workerId, 30000);
```

Bind the fence to writes in the protected resource. Treat tokens as decimal integers. Renew and release match both owner and fence.
