import { describe, it, expect, vi } from "vitest";
import { createPostgresJobQueue, createPostgresJobWorker } from "./index.js";
describe("postgres jobs", () => {
  it("enqueues with caller supplied id", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const queue = createPostgresJobQueue({ query }, () => "generated");
    await expect(queue.enqueue("email", { to: "test" }, { id: "job-1" })).resolves.toBe("job-1");
    expect(query.mock.calls[0][1][0]).toBe("job-1");
    await expect(queue.enqueue("email", {}, { delayMs: -1 })).rejects.toThrow();
  });
  it("claims, executes and acknowledges jobs", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: "1", name: "email", payload: { to: "x" }, attempts: 1, created_at: "2026-01-01T00:00:00Z" }] }).mockResolvedValue({ rows: [], rowCount: 1 });
    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = createPostgresJobWorker({ query }, { workerId: "test", pollIntervalMs: 5 });
    worker.register("email", handler);
    await worker.start();
    await new Promise(resolve => setTimeout(resolve, 30));
    await worker.stop();
    expect(handler).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([sql]) => String(sql).includes("status='completed'"))).toBe(true);
  });
  it("rejects invalid worker configuration", () => {
    expect(() => createPostgresJobWorker({ query: vi.fn() }, { workerId: "", leaseMs: -1 })).toThrow();
  });
});
