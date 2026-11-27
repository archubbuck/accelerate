# Accelerate Data

Database adapters, transactions, caches, migrations and coordination.

Once published, install with `npm install @accelerate/data@next`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

The database adapters accept caller-supplied drivers. Install pg and its types if you use the PostgreSQL adapter.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Preview import |
| --- | --- |
| `@accelerate/cache-core` | `@accelerate/data/cache` |
| `@accelerate/cache-memory` | `@accelerate/data/cache/memory` |
| `@accelerate/cache-redis` | `@accelerate/data/cache/redis` |
| `@accelerate/data-core` | `@accelerate/data/core` |
| `@accelerate/data-postgres` | `@accelerate/data/postgres` |
| `@accelerate/data-prisma` | `@accelerate/data/prisma` |
| `@accelerate/data-sqlserver` | `@accelerate/data/sqlserver` |
| `@accelerate/idempotency-core` | `@accelerate/data/idempotency` |
| `@accelerate/idempotency-memory` | `@accelerate/data/idempotency/memory` |
| `@accelerate/idempotency-postgres` | `@accelerate/data/idempotency/postgres` |
| `@accelerate/locking-core` | `@accelerate/data/locking` |
| `@accelerate/locking-memory` | `@accelerate/data/locking/memory` |
| `@accelerate/locking-postgres` | `@accelerate/data/locking/postgres` |
| `@accelerate/migrations-core` | `@accelerate/data/migrations` |
| `@accelerate/migrations-postgres` | `@accelerate/data/migrations/postgres` |
| `@accelerate/transactions` | `@accelerate/data/transactions` |
