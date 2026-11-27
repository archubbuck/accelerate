import { it, expect } from "vitest";
import { manualClock } from "@accelerate/time-core";
import {
  createRateLimiter,
  rateLimitMiddleware,
  type Algorithm,
  type QuotaState,
  type QuotaStore,
} from "./index.js";
function fixture(algorithm: Algorithm) {
  const clock = manualClock("2026-01-01T00:00:00.000Z");
  let state: QuotaState = [];
  const store: QuotaStore = {
    async update(_key, fn) {
      const m = fn(state, clock.now().getTime());
      if (m.state) state = m.state;
      return m.value;
    },
  };
  const limiter = createRateLimiter(store, clock);
  const demand = (cost = 1) => ({
    partition: "test",
    rules: [{ scope: "jobs", algorithm, limit: 4, periodMs: 1000, cost }],
  });
  return { clock, limiter, demand };
}
it("refills fractional weighted token debt deterministically", async () => {
  const { clock, limiter, demand } = fixture("token-bucket");
  await limiter.consume(demand(4));
  clock.advance(249);
  expect(await limiter.consume(demand())).toMatchObject({
    allowed: false,
    retryAfterMs: 1,
  });
  clock.advance(1);
  expect(await limiter.consume(demand())).toMatchObject({
    allowed: true,
    quotas: [{ remaining: 0 }],
  });
  clock.advance(500);
  expect((await limiter.consume(demand(2))).allowed).toBe(true);
});
it("computes weighted sliding-window retry from the necessary expirations", async () => {
  const { clock, limiter, demand } = fixture("sliding-window");
  await limiter.consume(demand(1));
  clock.advance(100);
  await limiter.consume(demand(3));
  expect(await limiter.consume(demand(2))).toMatchObject({
    allowed: false,
    retryAfterMs: 1000,
  });
  clock.advance(900);
  expect(await limiter.consume(demand(2))).toMatchObject({
    allowed: false,
    retryAfterMs: 100,
  });
  clock.advance(100);
  expect((await limiter.consume(demand(4))).allowed).toBe(true);
});
it("recovers expired leases and prevents stale release", async () => {
  const { clock, limiter, demand } = fixture("concurrency");
  const old = await limiter.consume(demand(4));
  clock.advance(1000);
  const next = await limiter.consume(demand(4));
  expect(next.allowed).toBe(true);
  expect(await limiter.release(old.permit!)).toBe(false);
  expect((await limiter.consume(demand())).allowed).toBe(false);
});
it("waits until fixed quota resets and cancels a pending wait", async () => {
  const { clock, limiter, demand } = fixture("fixed-window");
  await limiter.consume(demand(4));
  const ctrl = new AbortController(),
    aborted = limiter.acquire(demand(), { waitMs: 1000, signal: ctrl.signal });
  await Promise.resolve();
  ctrl.abort(Error("stop"));
  await expect(aborted).rejects.toThrow("stop");
  const waiting = limiter.acquire(demand(), { waitMs: 1000 });
  await new Promise<void>((resolve) => setImmediate(resolve));
  clock.advance(1000);
  expect((await waiting).allowed).toBe(true);
});
it("maps rejection to HTTP 429 and releases a permit on handler failure", async () => {
  const { limiter, demand } = fixture("concurrency");
  const m = rateLimitMiddleware(limiter, () => demand(4));
  const req = { url: "/", method: "GET" };
  const held = await limiter.consume(demand(4));
  expect(
    await m(req, async () => {
      throw Error("unexpected");
    }),
  ).toMatchObject({ status: 429, headers: { "Retry-After": "1" } });
  await limiter.release(held.permit!);
  await expect(
    m(req, async () => {
      throw Error("downstream");
    }),
  ).rejects.toThrow("downstream");
  expect((await limiter.consume(demand(4))).allowed).toBe(true);
});
it("rejects invalid costs, duplicate scopes and conflicting active policies", async () => {
  const { limiter, demand } = fixture("token-bucket"),
    d = demand();
  await expect(limiter.consume(demand(5))).rejects.toThrow();
  await expect(
    limiter.consume({ ...d, rules: [...d.rules, ...d.rules] }),
  ).rejects.toThrow("Duplicate");
  await limiter.consume(d);
  await expect(
    limiter.consume({ ...d, rules: [{ ...d.rules[0], limit: 5 }] }),
  ).rejects.toThrow("Conflicting");
});
