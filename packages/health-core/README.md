# @accelerate/health-core

Framework-neutral asynchronous dependency health checks with healthy, degraded and unhealthy statuses. Each check is isolated, timed out, and aggregated into one report.

```ts
import { createHealthRegistry } from "@accelerate/health-core";
const health = createHealthRegistry({ timeoutMs: 2000 });
health.register("database", async () => ({ status: "healthy" }));
const report = await health.run();
```

A thrown or timed-out check is reported as unhealthy. Do not expose sensitive internal error messages on publicly accessible endpoints.
