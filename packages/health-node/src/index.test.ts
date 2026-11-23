import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { createHealthRegistry } from "@accelerate/health-core";
import { createHealthHandler } from "./index.js";
describe("health handler", () => {
  it("responds with JSON and 503 for unhealthy dependencies", async () => {
    const registry = createHealthRegistry();
    registry.register("db", () => ({ status: "unhealthy" }));
    const handler = createHealthHandler(registry);
    const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No address");
      const response = await fetch("http://127.0.0.1:" + address.port + "/health");
      expect(response.status).toBe(503);
      expect((await response.json()).status).toBe("unhealthy");
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
