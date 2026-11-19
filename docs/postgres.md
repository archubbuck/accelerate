# PostgreSQL integration

Install `@accelerate/authorization-core`, `@accelerate/authorization-postgres`, and `pg`. Apply `packages/authorization-postgres/schema.sql` to your database using your normal migration tooling.

```ts
import { Pool } from "pg";
import { definePermissions, createAuthorization } from "@accelerate/authorization-core";
import { PostgresAuthorizationStore } from "@accelerate/authorization-postgres";

const permissions = definePermissions({
  documents: { read: "Read documents", edit: "Edit documents" }
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const authorization = createAuthorization({
  permissions,
  store: new PostgresAuthorizationStore(pool)
});

// Call on the trusted server using the authenticated user's ID:
const allowed = await authorization.can(authenticatedUserId, "documents.read");
if (!allowed) throw new Error("Forbidden");
```

**Security:** Never use user-submitted IDs as authenticated identities. Keep role mutations behind an independently authorized administrative boundary. Use a least-privilege database account and TLS as appropriate. The current schema has no tenant isolation or audit log and is not sufficient for multi-tenant deployments.
