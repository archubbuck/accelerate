# @accelerate/data-core

Database-neutral TypeScript contracts for parameterized queries and managed transactions. No driver dependency.

```ts
import type { Database } from "@accelerate/data-core";
async function countUsers(db: Database) {
  const result = await db.query<{ count: string }>("SELECT count(*) AS count FROM users");
  return Number(result.rows[0]?.count ?? 0);
}
```

The transaction callback commits on success and rolls back on failure. Never interpolate untrusted input into SQL; use parameters.
