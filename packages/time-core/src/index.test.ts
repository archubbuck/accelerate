import { expect, it } from "vitest";
import { manualClock, fixedClock, durationMs, utc } from "./index.js";

it("advances wall and monotonic time and cancels sleepers", async () => {
  const clock = manualClock("2024-02-29T00:00:00Z");
  const fixed = fixedClock(clock.now(), clock);
  const controller = new AbortController();
  const aborted = clock.delay(8, controller.signal);
  controller.abort();
  await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
  let fired = false;
  const due = fixed.delay(5).then(() => {
    fired = true;
  });
  clock.advance(4);
  await Promise.resolve();
  expect(fired).toBe(false);
  clock.advance(1);
  await due;
  expect(fixed.monotonicMs()).toBe(5);
  expect(clock.now().getTime() - fixed.now().getTime()).toBe(5);
  expect(durationMs(1.5, "s")).toBe(1500);
  expect(() => utc("2023-02-29T00:00:00Z")).toThrow();
  expect(() => clock.advance(-1)).toThrow();
});
