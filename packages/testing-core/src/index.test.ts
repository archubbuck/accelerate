import { describe, it, expect } from "vitest";
import { assertDefined, AssertionFailure, waitFor } from "./index.js";
describe("testing helpers", () => {
  it("narrows defined values", () => { expect(() => assertDefined(null)).toThrow(AssertionFailure); expect(() => assertDefined(0)).not.toThrow(); });
  it("polls until the predicate passes", async () => { let count = 0; expect(await waitFor(() => ++count, n => n >= 3)).toBe(3); });
  it("times out", async () => { await expect(waitFor(() => false, Boolean, { timeoutMs: 1 })).rejects.toThrow(AssertionFailure); });
});
