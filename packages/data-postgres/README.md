# @accelerate/data-postgres

PostgreSQL adapter for `@accelerate/data-core` using a caller-owned `pg.Pool`.

```ts
import { Pool } from "pg";
import { createPostgresDatabase } from "@accelerate/data-postgres";
const db = createPostgresDatabase(new Pool({ connectionString: process.env.DATABASE_URL }));
await db.transaction(async tx => {
  await tx.query("INSERT INTO users(name) VALUES ($1)", ["Ada"]);
});
await db.close();
```

Transaction callbacks are bound to one connection. Nested transactions are not supported. Pass query parameters rather than interpolating values. Closing the adapter ends the supplied pool.
