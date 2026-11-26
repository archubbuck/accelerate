import { expect, it } from "vitest";
import { manualClock } from "@accelerate/time-core";
import { memoryIdempotency } from "./index.js";

it("reconciles a crash, replays results and expires terminal records", async () => {
  const clock = manualClock(new Date(0));
  const store = memoryIdempotency(clock);
  const op = { key: "k", fingerprint: "f" };
  const decisions = await Promise.all([store.claim(op, 5), store.claim(op, 5)]);
  const first = decisions[0];
  if (first.status !== "claimed") throw new Error("Missing claim");
  expect(decisions[1].status).toBe("pending");
  expect((await store.claim({ ...op, fingerprint: "x" }, 5)).status).toBe(
    "conflict",
  );
  clock.advance(5);
  const outcome = {
    status: "failed" as const,
    result: { reason: "cancelled" },
  };
  expect((await store.claim(op, 5)).status).toBe("abandoned");
  expect(await store.finish(first.claim, outcome, 5)).toBe(false);
  expect(await store.reconcile(first.claim, outcome, 5)).toBe(true);
  expect(await store.claim(op, 5)).toEqual(outcome);
  clock.advance(5);
  expect((await store.claim(op, 5)).status).toBe("claimed");
});
