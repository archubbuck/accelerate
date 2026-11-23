import { describe, it, expect } from "vitest";
import { createHealthRegistry } from "./index.js";
describe("health registry", () => {
  it("reports healthy and degraded dependencies", async () => {
    const registry = createHealthRegistry();
    registry.register("database", () => ({ status: "healthy" }));
    registry.register("cache", () => ({ status: "degraded" }));
    expect((await registry.run()).status).toBe("degraded");
  });
  it("isolates thrown checks", async () => {
    const registry = createHealthRegistry();
    registry.register("db", () => { throw new Error("offline"); });
    expect((await registry.run()).checks.db).toEqual({ status: "unhealthy", message: "offline" });
  });
  it("rejects duplicate names", () => {
    const registry = createHealthRegistry();
    registry.register("db", () => ({ status: "healthy" }));
    expect(() => registry.register("db", () => ({ status: "healthy" }))).toThrow();
  });
  it("times out hung checks", async () => {
    const registry = createHealthRegistry({ timeoutMs: 5 });
    registry.register("hung", () => new Promise(() => {}));
    expect((await registry.run()).status).toBe("unhealthy");
  });
});
