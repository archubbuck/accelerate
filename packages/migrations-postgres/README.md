# @accelerate/migrations-postgres

Transactional PostgreSQL migrations with dry-run, history and crash recovery.

Inject a Database from @accelerate/data-postgres. Configure a trusted search_path and use a migration role with DDL privileges. A transaction-scoped advisory lock coordinates runners in the database. Each batch uses READ COMMITTED and writes schema changes and checksums in the same transaction. After a runner disconnects its open transaction rolls back and another runner can retry.

```ts
import { migrate } from "@accelerate/migrations-postgres";
const manifest = [{ id: "orders/1", statements: ["CREATE TABLE orders (id bigint PRIMARY KEY)"] }];
const pending = await migrate(db, manifest, { dryRun: true });
const applied = await migrate(db, manifest);
```

Use one transaction-compatible SQL command per statement. Transaction-control statements and commands requiring autocommit are outside this runner's contract. Keep deployed history immutable and append corrections. To adopt existing schemas incrementally, provide a reviewed baseline that checks the existing structure before recording its ID.
