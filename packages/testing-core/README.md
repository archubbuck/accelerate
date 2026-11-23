# @accelerate/testing-core

Framework-independent testing utilities for Accelerate. Not a replacement for Vitest, Jest or Node's test runner.

## Usage

Use `assertDefined`, `assertNever`, and `waitFor` in tests. `waitFor` accepts a probe, optional predicate, and timeout, interval, and cancellation options.

Run `pnpm --filter @accelerate/testing-core build`, `typecheck`, and `test` from the repository root.
