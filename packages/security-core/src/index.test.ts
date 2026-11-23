import { expect, it } from "vitest"; import { assertNonEmpty, assertPositiveDuration, redactSecret } from "./index.js";
it("validates input and redacts secrets", () => { expect(() => assertNonEmpty(" ")).toThrow(); expect(() => assertPositiveDuration(-1)).toThrow(); expect(redactSecret("secret")).toBe("[REDACTED]"); });
