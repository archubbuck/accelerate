import { describe, expect, it } from "vitest";
import { createLogger, createMemoryTransport } from "./index.js";
describe("logging core", () => {
  it("filters, inherits and redacts nested values", () => {
    const memory = createMemoryTransport();
    const logger = createLogger({ service: "test", level: "info", transports: [memory] });
    logger.debug("ignored");
    logger.child({ component: "auth" }).info("accepted", { password: "secret", nested: { accessToken: "hidden" } });
    expect(memory.entries).toHaveLength(1);
    expect(memory.entries[0].context).toEqual({ component: "auth", password: "[REDACTED]", nested: { accessToken: "[REDACTED]" } });
  });
  it("isolates transport errors and flushes async writes", async () => {
    let delivered = false;
    const logger = createLogger({ service: "test", transports: [{ async write() { await Promise.resolve(); delivered = true; } }, { write() { throw Error("unavailable"); } }] });
    expect(() => logger.info("hello")).not.toThrow();
    await logger.flush();
    expect(delivered).toBe(true);
  });
});
