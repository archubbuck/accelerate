# @accelerate/testing-contracts

Reusable implementation contract suites with isolated subject factories, optional cleanup, per-case results and aggregate assertions.

## Usage

```ts
const results = await verifyContract(createAdapter, cases, disposeAdapter);
assertContract(results);
```
