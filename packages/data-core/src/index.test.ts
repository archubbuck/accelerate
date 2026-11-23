import { describe, expect, it } from "vitest";
import { assertSql, DatabaseError } from "./index.js";
describe("data contracts", () => { it("rejects empty SQL", () => { expect(() => assertSql("  ")).toThrow(TypeError); expect(() => assertSql("SELECT 1")).not.toThrow(); }); it("preserves causes", () => { const cause = new Error("driver"); expect(new DatabaseError("failed", { cause }).cause).toBe(cause); }); });
