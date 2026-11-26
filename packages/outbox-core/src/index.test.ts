import { describe, expect, it, vi } from "vitest";
import { publishNext } from "./index.js";

const event = {
  id: "evt-1",
  type: "example",
  payload: {},
  occurredAt: "2026-01-01T00:00:00Z",
  correlationId: "request-1",
};
function fixture(attempt = 1) {
  return {
    claim: vi.fn(async () => ({ event, token: "token", attempt })),
    acknowledge: vi.fn(async () => true),
    retry: vi.fn(async () => true),
    deadLetter: vi.fn(async () => true),
  };
}
const options = { leaseMs: 5000, retryDelayMs: 10, maxAttempts: 2 };
describe("publishNext", () => {
  it("validates policy before claiming and skips an empty queue", async () => {
    const store = fixture();
    await expect(
      publishNext(store, vi.fn(), { ...options, maxAttempts: 0 }),
    ).rejects.toThrow(RangeError);
    expect(store.claim).not.toHaveBeenCalled();
    const publish = vi.fn();
    expect(
      await publishNext(
        { ...store, claim: async () => undefined },
        publish,
        options,
      ),
    ).toEqual({ status: "idle" });
    expect(publish).not.toHaveBeenCalled();
  });
  it("reports retries and exhausted deliveries without exposing broker errors", async () => {
    const publish = vi.fn(async () => {
      throw new Error("private broker detail");
    });
    for (const attempt of [1, 2]) {
      const store = fixture(attempt);
      expect(await publishNext(store, publish, options)).toEqual({
        status: attempt === 1 ? "retry" : "dead-letter",
        eventId: event.id,
        correlationId: event.correlationId,
        attempt,
      });
      expect(store.acknowledge).not.toHaveBeenCalled();
    }
  });
  it("does not classify a storage failure after publishing as a broker rejection", async () => {
    const store = fixture();
    store.acknowledge.mockRejectedValueOnce(new Error("connection closed"));
    await expect(publishNext(store, vi.fn(), options)).rejects.toThrow(
      "connection closed",
    );
    expect(store.retry).not.toHaveBeenCalled();
    store.acknowledge.mockResolvedValue(false);
    expect((await publishNext(store, vi.fn(), options)).status).toBe(
      "lease-lost",
    );
  });
});
