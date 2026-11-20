# @accelerate/authorization-postgres

PostgreSQL storage adapter for `@accelerate/authorization-core`.

```ts
import { Pool } from "pg";
import { PostgresAuthorizationStore } from "@accelerate/authorization-postgres";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = new PostgresAuthorizationStore(pool);
```

Apply `schema.sql` before using the adapter. The caller owns the pool lifecycle. The adapter uses parameterized queries and idempotent grants and assignments. Do not expose mutation methods directly to untrusted clients. This remains a single-tenant baseline. Tenant isolation, migration versioning, and tamper-resistant external audit storage remain future work.

## Audited administrative operations

Apply `admin.sql` after `schema.sql`. Import `PostgresAuthorizationAdmin` from `@accelerate/authorization-postgres/admin`. Supply a server-controlled `AdminPolicy` that validates each administrative action against the authenticated actor. The actor ID must come from trusted authentication middleware, not the request body.

```ts
import { PostgresAuthorizationAdmin } from "@accelerate/authorization-postgres/admin";
const admin = new PostgresAuthorizationAdmin(pool, permissions, {
  authorize: async (context, action) => {
    // Implement your application's privileged server-side policy.
    return await isAuthorizedAdministrator(context.actorId, action);
  }
});
await admin.grant({ actorId: authenticatedActorId }, roleId, "documents.read");
```

Administrative mutations and audit inserts share one PostgreSQL transaction. The lower-level `PostgresAuthorizationStore` still exposes unaudited mutation methods for compatibility; production administrative routes should use the audited service instead. Audit history requires the independent `audit.read` policy action; granting `role.create` does not authorize audit reads. This does not yet implement multi-tenant isolation or tamper-resistant external audit storage.

## Integration tests

The `src/integration.test.ts` suite uses a real PostgreSQL database and creates a temporary schema for each run. It is skipped when `AUTHORIZATION_TEST_DATABASE_URL` is unset. The configured database user must have permission to create and drop schemas. Never point this test at a production database.

```sh
AUTHORIZATION_TEST_DATABASE_URL=postgresql://user:password@localhost:5432/testdb pnpm --filter @accelerate/authorization-postgres test
```

GitHub Actions runs the suite against an ephemeral PostgreSQL 16 service.
