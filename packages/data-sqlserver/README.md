# @accelerate/data-sqlserver

SQL Server adapter using an injected mssql-compatible pool and transaction factory. Bind positional parameters as @p1, @p2, etc. Read-only transactions are rejected rather than silently ignored.

## Usage

```ts
import { createSqlServerDatabase } from "@accelerate/data-sqlserver";
const db = createSqlServerDatabase(pool, () => new sql.Transaction(pool));
await db.query('SELECT @p1 AS id', [1]);
```
