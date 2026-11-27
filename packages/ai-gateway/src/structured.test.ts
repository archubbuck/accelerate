import { expect, it, vi } from "vitest";
import { ModelError } from "@accelerate/ai-core";
import { ModelGateway } from "./index.js";

it("passes native format only to routes advertising support", async () => {
  const native = vi.fn(async () => { throw new ModelError("try fallback", true); });
  const fallback = vi.fn(async () => ({ content: "{}" }));
  const gateway = new ModelGateway(new Map([["route", [
    { model: "native", provider: { supportsStructuredOutput: () => true, generate: native } },
    { model: "plain", provider: { generate: fallback } },
  ]]]));
  const structuredOutput = { schemaId: "result", schemaVersion: "1", jsonSchema: {} };
  expect(await gateway.supportsStructuredOutput("route")).toBe(true);
  const result = await gateway.generate({ model: "route", messages: [], structuredOutput });
  expect(native).toHaveBeenCalledWith(expect.objectContaining({ model: "native", structuredOutput }));
  expect(fallback).toHaveBeenCalledWith({ model: "plain", messages: [] });
  expect(result.structuredOutputMode).toBe("prompt");
});
