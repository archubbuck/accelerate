import { describe, it, expect } from "vitest";
import { object, string, number, validate, ValidationError } from "./index.js";
describe("validation", () => {
  const schema = object({ name: string({ minLength: 2 }), age: number() });
  it("returns parsed values", () => expect(validate(schema, { name: "Ada", age: 37 })).toEqual({ name: "Ada", age: 37 }));
  it("collects nested field issues", () => {
    const result = schema.safeParse({ name: "A", age: "37" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.map(x => x.path[0])).toEqual(["name", "age"]);
  });
  it("throws typed errors", () => expect(() => validate(schema, {})).toThrow(ValidationError));
});
