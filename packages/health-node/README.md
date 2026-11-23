# @accelerate/health-node

Node.js HTTP health endpoint adapter for [health-core](../health-core/README.md).

```ts
import { createServer } from "node:http";
import { createHealthRegistry } from "@accelerate/health-core";
import { createHealthHandler } from "@accelerate/health-node";
const registry = createHealthRegistry();
registry.register("application", () => ({ status: "healthy" }));
const handler = createHealthHandler(registry);
createServer(async (req, res) => {
  if (!(await handler(req, res))) { res.writeHead(404); res.end(); }
}).listen(3000);
```

The handler returns 200 for healthy/degraded, 503 for unhealthy, 405 for unsupported methods, and false for unrelated routes. Restrict endpoint access when check messages may reveal internal details.
