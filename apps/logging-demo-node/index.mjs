import { createMemoryTransport } from "@accelerate/logging-core";
import { createNodeLogger, runWithLogContext } from "@accelerate/logging-node";
const memory = createMemoryTransport();
const logger = createNodeLogger({ service: "logging-demo-node", level: "debug", transports: [memory] });
await runWithLogContext({ correlationId: "demo-123" }, async () => {
  logger.child({ component: "demo" }).info("Hello from the published npm package", { password: "redacted" });
});
await logger.flush();
console.log(JSON.stringify(memory.entries, null, 2));
