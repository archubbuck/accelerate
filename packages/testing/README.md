# Accelerate Testing

Fixtures, transport helpers, contract and architecture tests.

Install with `npm install @accelerate/testing`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Replacement import |
| --- | --- |
| `@accelerate/testing-architecture` | `@accelerate/testing/architecture` |
| `@accelerate/testing-contracts` | `@accelerate/testing/contracts` |
| `@accelerate/testing-core` | `@accelerate/testing/core` |
| `@accelerate/testing-fixtures` | `@accelerate/testing/fixtures` |
| `@accelerate/testing-http` | `@accelerate/testing/http` |
| `@accelerate/testing-postgres` | `@accelerate/testing/postgres` |
