# @accelerate/transactions

Run an operation within a caller-provided transaction scope. Commit on success and attempt rollback on failure. If rollback also fails, both errors are preserved. The caller supplies begin, commit and rollback; this does not implement distributed transactions.

## Usage

```ts
import { runTransaction } from "@accelerate/transactions";
await runTransaction(begin, async scope => performWork(scope));
```

## Explicit composition

Pass the context to collaborating services and bind each repository to its executor. The runner owns commit and rollback. It must settle its promise only after the transaction has committed or rolled back.

```ts
import { composeTransaction } from "@accelerate/transactions";
await composeTransaction(database, async context => {
  const orders = context.bind(createOrderRepository);
  const inventory = context.bind(createInventoryRepository);
  await orders.insert(order);
  await inventory.reserve(order);
  context.afterCommit(() => notifyOrderCreated(order.id));
}, { isolationLevel: "serializable" });
```

The context closes when the operation settles. Await all repository work inside the operation. Repositories must use the provided executor and remain within that callback's lifetime.

Lifecycle callbacks run in registration order after the runner settles. Every registered callback is attempted even when an earlier one fails. A TransactionCallbackError with outcome "committed" means the transaction succeeded and a subsequent callback failed. Retrying the database operation in response can duplicate effects. Callbacks run in process and may be lost if the process exits. Durable delivery requires an outbox.

PostgreSQL executors expose an optional savepoint callback. Pass the child executor to repositories inside that callback. Parent access is suspended while a child savepoint runs. Nested child savepoints are supported. Await each savepoint before using its parent again. Executors reject new queries after their callback ends.

```ts
await context.executor.savepoint(async child => {
  await createOrderRepository(child).insert(order);
});
```
