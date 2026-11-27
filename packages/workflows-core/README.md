# @accelerate/workflows-core

Sequential, typed, in-process workflow runner with cancellation checks and injected job and event services. Steps stop on failure; no automatic retries, persistence, compensation or exactly-once guarantees. Use idempotent steps when rerunning workflows.

## Usage

```ts
import { WorkflowRunner } from "@accelerate/workflows-core";
const runner = new WorkflowRunner(queue, events);
const result = await runner.run('run-1', 1, [{ id: 'double', run: async n => n * 2 }]);
```

## Durable execution

Use `DurableWorkflowRunner` with the PostgreSQL or memory store. Register immutable definitions and activities on every worker. An instance pins its expanded definition and version when started. Reusing a start ID with the same version, plan and input is idempotent. Register earlier versions while instances still reference them. Changing handler behavior requires a new version and a distinct handler ID when old instances are active.

```ts
const runner = new DurableWorkflowRunner(store, [{
  name: "order", version: 1, concurrency: 2,
  stages: [
    [{ id: "price", kind: "task", handler: "price" },
     { id: "stock", kind: "task", handler: "reserve", compensate: "release" }],
    { id: "review", kind: "approval" },
    { id: "settle", kind: "task", handler: "settle", attempts: 3, timeoutMs: 30000, retryMs: 500 }
  ]
}], activities);
await runner.start(orderId, "order", 1, { sku });
await runner.tick(orderId);
```

Call tick repeatedly from your worker scheduler using the instance ID. Each call can execute one activity plus internal transitions. Concurrent calls can claim different parallel branches up to the instance limit. Inspect the persisted status to distinguish terminal, waiting and busy instances. A false tick means it claimed no activity. Use backoff when polling.

Stages execute in sequence. Arrays form parallel stages, share the previous output as input, and join into an object keyed by step ID. Conditions use `when: {field, equals}` on task input. Skipped tasks forward their input. Child steps (`{kind:"child", id, definition, version}`) embed the child's versioned stages under a unique path within the parent's instance, concurrency limit and cancellation scope. Durable waits store a deadline on first entry. Approval steps persist until your authorized operator calls `approve(id, path, true|false)`. A rejected approval unwinds the run.

Time limits start at claim. Pass the activity context's AbortSignal to cancellable operations. A timeout, crash or lost result allows another attempt. The store fences late completions. Persisted successful steps are skipped on resume. An external effect can occur before its result is checkpointed, so deduplicate that effect using the supplied stable idempotency key. Cancellation drains active claims until settlement or expiry. Successfully checkpointed activities with compensators unwind in reverse completion order. Compensation receives the original input and output and its own stable key. An exhausted compensation leaves the instance in `compensation-failed` for operator reconciliation. Reconcile externally committed effects with unknown outcomes separately.

Inspect returns the instance with step inputs and outputs. History returns ordered transition events with an exclusive pagination cursor, step paths, timestamps and attempt numbers. Use instance ID, path and attempt for tracing. Inputs and outputs are stored as JSON. Keep credentials out of those values and restrict access to the instance and history. Only trusted application code should register activity handlers, approve, cancel or inspect instances.
