import { expect } from "vitest";
import {
  createRateLimiter,
  type QuotaStore,
  type Rule,
} from "../../packages/rate-limit-core/dist/index.js";
export async function verifyQuotaStore(open: () => QuotaStore) {
  const partition = crypto.randomUUID(),
    workers = Array.from({ length: 8 }, () => createRateLimiter(open()));
  const base: Rule = {
    scope: "tenant",
    algorithm: "fixed-window",
    periodMs: 2147483647,
    limit: 7,
  };
  const decisions = await Promise.all(
    workers.map((w) => w.consume({ partition, rules: [{ ...base, cost: 2 }] })),
  );
  expect(decisions.filter((d) => d.allowed)).toHaveLength(3);
  const deny = await workers[0].consume({
    partition,
    rules: [
      { ...base, scope: "user", limit: 1 },
      { ...base, cost: 2 },
    ],
  });
  expect(deny.allowed).toBe(false);
  expect(deny.retryAfterMs).toBeGreaterThan(0);
  expect(
    (
      await workers[0].consume({
        partition,
        rules: [{ ...base, scope: "user", limit: 1 }],
      })
    ).allowed,
  ).toBe(true);
  const concurrency: Rule = {
    ...base,
    algorithm: "concurrency",
    scope: "jobs",
    limit: 1,
    periodMs: 60000,
  };
  const request = { partition, rules: [concurrency] };
  const held = await workers[0].consume(request);
  expect(held.allowed).toBe(true);
  expect((await workers[1].consume(request)).allowed).toBe(false);
  expect(await workers[2].release(held.permit!)).toBe(true);
  const replacement = await workers[3].consume(request);
  expect(replacement.allowed).toBe(true);
  expect(await workers[0].release(held.permit!)).toBe(false);
  expect((await workers[4].consume(request)).allowed).toBe(false);
}

export async function verifyPermitExpiry(open: () => QuotaStore) {
  const demand = {
    partition: crypto.randomUUID(),
    rules: [
      { scope: "worker", algorithm: "concurrency", limit: 1, periodMs: 200 },
    ],
  } as const;
  const abandoned = await createRateLimiter(open()).consume(demand);
  expect(abandoned.allowed).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const recovered = createRateLimiter(open());
  const replacement = await recovered.consume(demand);
  expect(replacement.allowed).toBe(true);
  expect(await recovered.release(abandoned.permit!)).toBe(false);
}
