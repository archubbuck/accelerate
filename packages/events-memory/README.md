# @accelerate/events-memory

Adapter for events memory. Install `@accelerate/events-memory` and its declared peer dependencies. The consuming application owns infrastructure setup and lifecycle.

Import the exported factory to create an adapter for the matching core contract.

Use `createMemoryEventJournal()` for an in-process ordered event history. For deterministic tests, pass `createMemoryJournalStorage(() => nowMs)`. Journal instances can share that storage. Restarting the process discards all records and checkpoints. The existing in-memory event bus continues to dispatch directly to its handlers. See the events-core durable subscription contract for delivery and replay examples.
