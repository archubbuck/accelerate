# @accelerate/workflows-memory

Pass `createMemoryWorkflowStore()` to `DurableWorkflowRunner`. Reuse the same store while reconstructing workers to simulate a restart. Pass a millisecond clock function for deterministic retry, expiry and wait tests. State and history are isolated per store and disappear on process exit.
