import { expect, it, vi } from "vitest";
import { object, string } from "@accelerate/validation-core";
import { generateStructured, StructuredOutputError } from "./index.js";
import type { ModelProvider } from "@accelerate/ai-core";

const output = {
  schemaId: "message", schemaVersion: "2", jsonSchema: {
    type: "object", properties: { text: { type: "string" } }, required: ["text"],
  },
};
const schema = object({ text: string() });

it("requests provider-native structure and validates the result", async () => {
  const generate = vi.fn<ModelProvider["generate"]>().mockResolvedValue({
    content: '{"text":"valid"}', usage: { inputTokens: 2, outputTokens: 4 },
  });
  const provider = { supportsStructuredOutput: () => true, generate };
  const result = await generateStructured(provider, { model: "model", messages: [] }, {
    output, schema, estimateCostMicros: () => 17n,
  });
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({ structuredOutput: output }));
  expect(result).toMatchObject({ data: { text: "valid" }, schemaVersion: "2", estimatedCostMicros: 17n });
  expect(result.attempts.map(value => value.mode)).toEqual(["native"]);
});

it("repairs invalid prompt output with bounded validation feedback", async () => {
 const generate = vi.fn<ModelProvider["generate"]>()
   .mockResolvedValueOnce({ content: '{"text":5}' })
   .mockResolvedValueOnce({ content: '{"text":"corrected"}' });
 const result = await generateStructured({ generate }, { model: "model", messages: [] }, { output, schema });
 expect(result.data).toEqual({ text: "corrected" });
 expect(result.attempts.map(value => value.content)).toEqual(['{"text":5}', '{"text":"corrected"}']);
 expect(generate.mock.calls[1][0].messages.at(-1)?.content).toContain("SCHEMA_MISMATCH");
 expect(generate.mock.calls[0][0].structuredOutput).toBeUndefined();
});

it("keeps invalid values out of results and keeps raw attempts out of error serialization", async () => {
  const generate = vi.fn<ModelProvider["generate"]>().mockResolvedValue({ content: "raw-data-sensitive" });
  let failure;
  try { await generateStructured({ generate }, { model: "model", messages: [] }, { output, schema, maxRepairs: 1 }); }
  catch (error) { failure = error; }
  expect(generate).toHaveBeenCalledTimes(2);
  expect(failure).toBeInstanceOf(StructuredOutputError);
  expect((failure as StructuredOutputError).attempts).toHaveLength(2);
  expect(JSON.stringify(failure)).not.toContain("raw-data-sensitive");
});
