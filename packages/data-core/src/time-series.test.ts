import { expect, it } from "vitest";
import { aggregateObservations, prepareObservationBatch, resampleObservations, rollingMean } from "./time-series.js";

it("handles batch ordering, duplicates, missing observations and windows deterministically", () => {
  const batch = [{ at: 2, value: 2 }, { at: 1, value: 1 }, { at: 2, value: 4 }];
  expect(() => prepareObservationBatch(batch)).toThrow("Duplicate");
  expect(() => prepareObservationBatch(batch, { duplicates: "ignore", outOfOrder: "reject" })).toThrow("Out-of-order");
  expect(prepareObservationBatch(batch, { duplicates: "replace" }).observations).toEqual([{ at: 1, value: 1 }, { at: 2, value: 4 }]);
  const observations = [{ at: 0, value: 2 }, { at: 10, value: null }, { at: 20, value: 6 }];
  expect(aggregateObservations(observations, "zero")).toEqual({ count: 3, min: 0, max: 6, mean: 8 / 3, sum: 8 });
  expect(rollingMean(observations, 15, "propagate")).toEqual([{ at: 0, value: 2 }, { at: 10, value: null }, { at: 20, value: null }]);
  expect(resampleObservations(observations, { start: 0, end: 40 }, 10).map(row => row.mean)).toEqual([2, null, 6, null]);
});
