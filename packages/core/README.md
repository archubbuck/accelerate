# Accelerate Core

Time, decimal arithmetic, validation and shared errors.

Install with `npm install @accelerate/core`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

See [typed state machines](https://github.com/archubbuck/accelerate/blob/main/docs/state-machine.md) for guarded transitions and optimistic revisions.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Replacement import |
| --- | --- |
| `@accelerate/decimal-core` | `@accelerate/core/decimal` |
| `@accelerate/errors-core` | `@accelerate/core/errors` |
| `@accelerate/time-core` | `@accelerate/core/time` |
| `@accelerate/validation-core` | `@accelerate/core/validation` |
