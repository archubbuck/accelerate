# @accelerate/tooling-core

Canonical operation contracts, schema validation and execution registry for Accelerate agent tooling.

## Usage

```js
import { OperationRegistry, executeOperation, validateSchema } from '@accelerate/tooling-core';
const registry = new OperationRegistry();
// Register a versioned manifest and handler before execution.
const result = await executeOperation(registry, {
  schemaVersion: '1.0',
  operation: 'example.inspect',
  operationVersion: '1.0.0',
  input: {}
}, { validateSchema });
```

Operations default to preview. Apply mode remains disabled. Schema validation supports an explicit subset of JSON Schema and rejects unsupported keywords.

## Development

Run `pnpm --filter @accelerate/tooling-core build`, `pnpm --filter @accelerate/tooling-core typecheck` and `pnpm --filter @accelerate/tooling-core test` from the repository root.

Distribution verification and npm publication are pending.
