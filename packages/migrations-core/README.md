# @accelerate/migrations-core

Versioned SQL manifests, SHA-256 history validation and dependency ordering.

Give each migration a stable package/version ID. Declare preceding versions in requires, including dependencies in other manifests. Supply statements as trusted SQL strings. A change to a statement or dependency changes the checksum.

```ts
import { planMigrations } from "@accelerate/migrations-core";
const manifest = [{ id: "orders/1", statements: ["CREATE TABLE orders (id bigint PRIMARY KEY)"] }];
const pending = await planMigrations(manifest, []);
```

Planning is side-effect free. Installed history can satisfy dependencies when running a subset of manifests. Validation compares checksums for every supplied historical manifest.

Agents can discover the installed migrations.plan operation to preview pending IDs and checksums from a manifest and optional history. It performs no database access.
