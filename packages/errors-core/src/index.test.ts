import { describe, it, expect } from "vitest";
import { ApplicationError, toErrorResponse } from "./index.js";
describe("application errors", () => {
  it("serializes known errors", () => {
    const error = new ApplicationError({ code: "NOT_FOUND", message: "Missing", status: 404 });
    expect(toErrorResponse(error)).toEqual({ status: 404, body: { error: { code: "NOT_FOUND", message: "Missing" } } });
  });
  it("hides unexpected error messages", () => {
    expect(toErrorResponse(new Error("secret")).body.error.message).not.toContain("secret");
  });
  it("rejects invalid statuses", () => {
    expect(() => new ApplicationError({ code: "INVALID", message: "bad", status: 200 })).toThrow();
  });
});
