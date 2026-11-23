# @accelerate/testing-fixtures

Framework-independent testing utilities for Accelerate. Not a replacement for Vitest, Jest or Node's test runner.

## Usage

Use `createFixtureFactory` to create reproducible objects with sequence-based identifiers and optional overrides. Call `reset()` to replay the sequence. `seededRandom` provides deterministic, non-cryptographic pseudorandom values.

Run `pnpm --filter @accelerate/testing-fixtures build`, `typecheck`, and `test` from the repository root.
