# @accelerate/authentication-postgres

PostgreSQL identity lookups and session persistence. Apply `schema.sql` as part of your database migration process before using these stores.

```ts
import { createPostgresIdentityStore, createPostgresSessionStore } from "@accelerate/authentication-postgres";
const identities = createPostgresIdentityStore(db);
const sessions = createPostgresSessionStore(db);
```

Store only hashed session token digests in `accelerate_sessions.id`. Identity creation, email verification, and password management are intentionally outside these persistence adapters.
