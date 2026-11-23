import { describe, it, expect } from "vitest";
import { configField, defineConfig, ConfigurationError } from "./index.js";
describe("configuration", () => {
  const shape = { PORT: configField.number(3000), ENABLED: configField.boolean(false), HOST: configField.string() };
  it("parses strings and applies defaults", () => {
    expect(defineConfig(shape, { PORT: "8080", HOST: "localhost" })).toEqual({ PORT: 8080, ENABLED: false, HOST: "localhost" });
  });
  it("rejects invalid booleans", () => expect(() => defineConfig(shape, { HOST: "localhost", ENABLED: "yes" })).toThrow(ConfigurationError));
  it("rejects missing required fields", () => expect(() => defineConfig(shape, {})).toThrow(ConfigurationError));
});
