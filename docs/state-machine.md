# Typed state machines

Install `@accelerate/core` and import `createStateMachine` from `@accelerate/core/state-machine`. Model events as a discriminated union and define their permitted transitions. Use optional guards, metadata, and exit, transition, and entry reducers. A terminal state rejects all further events.

```ts
const machine = createStateMachine(definition, store);
await machine.start(id, context);
const revision = (await machine.inspect(id))!.revision;
const { snapshot, transition } = await machine.send(id, { type: 'submit' }, revision);
```

Use an optimistic revision when a client submits a transition based on an earlier view. The store atomically commits a new snapshot and appends its transition record only when the expected revision matches. Use `StateConflictError` to refresh state before attempting another change.

Keep guards and reducers free of external side effects. They run before a transition wins the compare-and-swap. For audit or event publication, use the committed transition receipt or implement an outbox in a durable store's commit transaction. The memory store is deterministic and suitable for tests. Persist JSON-compatible context and event values when using JSON stores.

Use `describe(state)` to inspect candidate transitions, `history(id, after, limit)` for recorded transitions, and `restore(snapshot)` to initialize a new store from a trusted serialized snapshot. Restore keeps the revision and does not reconstruct prior history.
