# Structured generation and recovery

Install `@accelerate/ai` and use `generateStructured` from `@accelerate/ai/structured`. Pass a runtime schema with `safeParse`, a JSON Schema describing the same shape, and an explicit schema ID and version.

```ts
const result = await generateStructured(gateway, request, {
  schema: runtimeSchema,
  output: { schemaId: 'order-summary', schemaVersion: '1', jsonSchema },
  maxRepairs: 1,
});
await processOrderSummary(result.data);
```

Providers advertise model-specific native support with `supportsStructuredOutput(model)` and receive `request.structuredOutput` when supported. The gateway reevaluates this capability for each concrete fallback route. Prompt-based routes receive the schema in the request messages. Both paths validate the output locally before returning typed data. Tool calls are disabled in structured generation.

Repair attempts are bounded and report validation paths by default. A repair policy can supply custom instructions or stop the loop. Attempts retain bounded original and corrected outputs, reported token usage, and the mode used by the provider. Supply `estimateCostMicros` to collect application-specific cost estimates. Attempts without reported usage are counted separately. The budget guard in `@accelerate/ai/usage/budgets` enforces reservations per invocation, including retries and fallback routes.

Handle `StructuredOutputError` at the processing boundary. Its error message omits raw output. Inspect `error.attempts` only where the originating model output can be handled securely.
