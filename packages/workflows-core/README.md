# @accelerate/workflows-core

Sequential, typed, in-process workflow runner with cancellation checks and injected job and event services. Steps stop on failure; no automatic retries, persistence, compensation or exactly-once guarantees. Use idempotent steps when rerunning workflows.

## Usage

```ts
import { WorkflowRunner } from "@accelerate/workflows-core";
const runner = new WorkflowRunner(queue, events);
const result = await runner.run('run-1', 1, [{ id: 'double', run: async n => n * 2 }]);
```
