import { expect, it } from "vitest";
import { serializeOutcome, validateOperation } from "./index.js";
it("rejects invalid claims and nonfinite results", () => {
  expect(() => validateOperation({ key: "", fingerprint: "f" }, 1)).toThrow();
  expect(() =>
    serializeOutcome({ status: "completed", result: [NaN] }),
  ).toThrow();
});
