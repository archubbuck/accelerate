# @accelerate/data-prisma

Prisma adapter using an explicit bridge for raw query and interactive transaction operations. The bridge must bind parameters using the provider's placeholder syntax and return affected-row counts for writes. Never interpolate untrusted values into SQL. Read-only transactions are rejected.

## Usage

```ts
import { createPrismaDatabase } from "@accelerate/data-prisma";
const db = createPrismaDatabase(bridge);
await db.query('SELECT $1', [1]);
```
