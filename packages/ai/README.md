# Accelerate Ai

Model gateways, prompts, structured output, agents and evaluation.

Install with `npm install @accelerate/ai`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

See [persistent AI usage and budget enforcement](https://github.com/archubbuck/accelerate/blob/main/docs/ai-budgets.md) for guarded gateway and agent calls. See [structured generation and recovery](https://github.com/archubbuck/accelerate/blob/main/docs/structured-output.md) for schema-constrained output.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Replacement import |
| --- | --- |
| `@accelerate/agents-core` | `@accelerate/ai/agents` |
| `@accelerate/ai-core` | `@accelerate/ai/core` |
| `@accelerate/ai-evaluation` | `@accelerate/ai/evaluation` |
| `@accelerate/ai-gateway` | `@accelerate/ai/gateway` |
| `@accelerate/ai-prompts` | `@accelerate/ai/prompts` |
| `@accelerate/ai-structured` | `@accelerate/ai/structured` |
| `@accelerate/ai-tools` | `@accelerate/ai/tools` |
| `@accelerate/ai-usage` | `@accelerate/ai/usage` |
