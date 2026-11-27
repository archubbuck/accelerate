import { expect, it } from "vitest";
import { manualClock } from "@accelerate/time-core";
import {
  bulkhead,
  circuitBreaker,
  executeResilient,
  CircuitOpenError,
  BulkheadFullError,
  DeadlineError,
  retryAfterMs,
} from "./index.js";
const clock = () => manualClock("2026-01-01T00:00:00Z");
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
it("admits a single recovery probe and ignores late work from earlier generations", async () => {
  const time = clock(),
    breaker = circuitBreaker({ failures: 1, cooldownMs: 10, clock: time });
  let late!: () => void;
  const earlier = breaker.run(
    () =>
      new Promise<void>((resolve) => {
        late = resolve;
      }),
  );
  await expect(
    breaker.run(async () => {
      throw Error("down");
    }),
  ).rejects.toThrow("down");
  late();
  await earlier;
  await expect(breaker.run(async () => 1)).rejects.toBeInstanceOf(
    CircuitOpenError,
  );
  time.advance(10);
  let recover!: () => void;
  const probe = breaker.run(
    () =>
      new Promise<void>((resolve) => {
        recover = resolve;
      }),
  );
  await expect(breaker.run(async () => 1)).rejects.toBeInstanceOf(
    CircuitOpenError,
  );
  recover();
  await probe;
  expect(await breaker.run(async () => 2)).toBe(2);
});
it("retains capacity until timed-out work actually settles", async () => {
  const time = clock(),
    capacity = bulkhead(1);
  let finish!: () => void;
  const pending = executeResilient(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    { bulkhead: capacity, deadlineMs: 10, clock: time },
  );
  time.advance(10);
  await expect(pending).rejects.toBeInstanceOf(DeadlineError);
  await expect(capacity.run(async () => 1)).rejects.toBeInstanceOf(
    BulkheadFullError,
  );
  finish();
  await flush();
  expect(await capacity.run(async () => 2)).toBe(2);
});
it("honors Retry-After and jitter only for explicitly replayable operations", async () => {
  const time = clock(),
    delays: number[] = [];
  const run = executeResilient(
    async ({ attempt }) => {
      if (attempt < 3) throw Error("transient");
      return attempt;
    },
    {
      clock: time,
      retrySafety: "idempotent",
      classify: () => "transient",
      random: () => 0.5,
      retryAfter: () => (delays.length === 0 ? "1" : undefined),
      onEvent: (event) => {
        if (event.kind === "retry") delays.push(event.delayMs!);
      },
    },
  );
  await flush();
  time.advance(1000);
  await flush();
  time.advance(100);
  expect(await run).toBe(3);
  expect(delays).toEqual([1000, 100]);
  let calls = 0;
  expect(
    await executeResilient(
      async () => {
        calls++;
        throw Error("failure");
      },
      { classify: () => "transient", fallback: async () => 42 },
    ),
  ).toBe(42);
  expect(calls).toBe(1);
  expect(retryAfterMs("Thu, 01 Jan 2026 00:00:02 GMT", time.now())).toBe(900);
});
it("cancels pending backoff without retrying or falling back", async () => {
  const controller = new AbortController(),
    time = clock();
  const run = executeResilient(
    async () => {
      throw Error("transient");
    },
    {
      clock: time,
      signal: controller.signal,
      retrySafety: "idempotent",
      classify: () => "transient",
      fallback: async () => 42,
      random: () => 0.5,
    },
  );
  await flush();
  controller.abort(Error("cancelled"));
  await expect(run).rejects.toThrow("cancelled");
});
