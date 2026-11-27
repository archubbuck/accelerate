# Accelerate Config

Configuration, secrets and feature flags.

Install with `npm install @accelerate/config`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Replacement import |
| --- | --- |
| `@accelerate/config-core` | `@accelerate/config/config` |
| `@accelerate/config-node` | `@accelerate/config/config/node` |
| `@accelerate/feature-flags-core` | `@accelerate/config/flags` |
| `@accelerate/feature-flags-memory` | `@accelerate/config/flags/memory` |
| `@accelerate/feature-flags-postgres` | `@accelerate/config/flags/postgres` |
| `@accelerate/secrets-core` | `@accelerate/config/secrets` |
