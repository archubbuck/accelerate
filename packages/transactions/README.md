# @accelerate/transactions

Run an operation within a caller-provided transaction scope. Commit on success and attempt rollback on failure. If rollback also fails, both errors are preserved. The caller supplies begin, commit and rollback; this does not implement distributed transactions.

## Usage

```ts
import { runTransaction } from "@accelerate/transactions";
await runTransaction(begin, async scope => performWork(scope));
```
