# @accelerate/authorization-postgres

PostgreSQL storage adapter for `@accelerate/authorization-core`.

```ts
import { Pool } from "pg";
import { PostgresAuthorizationStore } from "@accelerate/authorization-postgres";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = new PostgresAuthorizationStore(pool);
```

Apply `schema.sql` before using the adapter. The caller owns the pool lifecycle. The adapter uses parameterized queries and idempotent grants and assignments. Do not expose mutation methods directly to untrusted clients. This is a single-tenant baseline: tenant isolation, audit logging, migration versioning, and transactional administrative operations remain future work.
