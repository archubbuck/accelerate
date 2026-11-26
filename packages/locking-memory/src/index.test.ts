import { expect, it } from "vitest";
import { manualClock } from "@accelerate/time-core";
import { memoryLocks } from "./index.js";

it("grants one lease and fences an expired owner even when the owner ID is reused", async () => {
  const clock = manualClock(new Date(0));
  const locks = memoryLocks(clock);
  const leases = await Promise.all(
    Array.from({ length: 8 }, () => locks.acquire("k", "w", 5)),
  );
  expect(leases.filter(Boolean)).toHaveLength(1);
  const first = leases[0]!;
  expect(await locks.renew(first, 10)).toBe(true);
  clock.advance(10);
  const second = await locks.acquire("k", "w", 5);
  expect(BigInt(second!.fence)).toBeGreaterThan(BigInt(first.fence));
  expect(await locks.release(first)).toBe(false);
  expect(await locks.renew(first, 5)).toBe(false);
});
