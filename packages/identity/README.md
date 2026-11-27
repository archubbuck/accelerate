# Accelerate Identity

Authentication, authorization, API keys and auditing.

Once published, install with `npm install @accelerate/identity@next`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

Enforce authorization in your server. Install pg and its types for the pool-based PostgreSQL adapter.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Preview import |
| --- | --- |
| `@accelerate/api-keys` | `@accelerate/identity/api-keys` |
| `@accelerate/audit-core` | `@accelerate/identity/audit` |
| `@accelerate/audit-postgres` | `@accelerate/identity/audit/postgres` |
| `@accelerate/authentication-core` | `@accelerate/identity/authentication` |
| `@accelerate/authentication-node` | `@accelerate/identity/authentication/node` |
| `@accelerate/authentication-postgres` | `@accelerate/identity/authentication/postgres` |
| `@accelerate/authorization-core` | `@accelerate/identity/authorization` |
| `@accelerate/authorization-postgres` | `@accelerate/identity/authorization/postgres` |
| `@accelerate/authorization-postgres/admin` | `@accelerate/identity/authorization/postgres/admin` |
| `@accelerate/security-core` | `@accelerate/identity/security` |
