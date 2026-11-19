# @accelerate/authorization-postgres

PostgreSQL storage adapter for `@accelerate/authorization-core`.

```ts
import { Pool } from "pg";
import { PostgresAuthorizationStore } from "@accelerate/authorization-postgres";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = new PostgresAuthorizationStore(pool);
```

Apply `schema.sql` before using the adapter. The caller owns the pool lifecycle. The adapter uses parameterized queries and idempotent grants and assignments. Do not expose mutation methods directly to untrusted clients. This is a single-tenant baseline: tenant isolation, audit logging, migration versioning, and transactional administrative operations remain future work.

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

Administrative mutations and audit inserts share one PostgreSQL transaction. The lower-level `PostgresAuthorizationStore` still exposes unaudited mutation methods for compatibility; production administrative routes should use the audited service instead. This does not yet implement multi-tenant isolation, a separately scoped audit-read permission, or tamper-resistant external audit storage.
