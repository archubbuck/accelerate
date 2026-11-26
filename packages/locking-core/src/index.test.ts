import { expect, it } from "vitest";
import { manualClock } from "@accelerate/time-core";
import { waitForLease } from "./index.js";

it("times out or cancels while contending", async () => {
  const clock = manualClock(new Date(0));
  const store = {
    acquire: async () => undefined,
    release: async () => false,
    renew: async () => false,
  };
  const wait = waitForLease(store, clock, "k", "worker", 10, {
    timeoutMs: 5,
    retryMs: 10,
  });
  await Promise.resolve();
  clock.advance(5);
  expect(await wait).toBeUndefined();
  await expect(
    waitForLease(store, clock, "k", "worker", 10, {
      timeoutMs: 5,
      retryMs: 1,
      signal: AbortSignal.abort(),
    }),
  ).rejects.toThrow();
});
