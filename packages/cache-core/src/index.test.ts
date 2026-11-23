import { it, expect } from "vitest";
import { assertTtl } from "./index.js";
it("rejects invalid TTLs", () => { expect(() => assertTtl(-1)).toThrow(RangeError); expect(() => assertTtl(Infinity)).toThrow(RangeError); expect(() => assertTtl(0)).not.toThrow(); });
