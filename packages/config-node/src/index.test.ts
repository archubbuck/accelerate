import { describe, it, expect } from "vitest";
import { configField } from "@accelerate/config-core";
import { loadEnvironment } from "./index.js";
describe("loadEnvironment", () => {
  it("parses prefixed variables", () => {
    expect(loadEnvironment({ PORT: configField.number() }, { APP_PORT: "8080" }, { prefix: "APP_" })).toEqual({ PORT: 8080 });
  });
  it("fails when required values are missing", () => {
    expect(() => loadEnvironment({ HOST: configField.string() }, {})).toThrow("HOST");
  });
});
