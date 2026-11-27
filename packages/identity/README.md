# Accelerate Identity

Authentication, authorization, API keys and auditing.

Install with `npm install @accelerate/identity`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

Enforce authorization in your server. Install pg and its types for the pool-based PostgreSQL adapter. See the [OAuth and OpenID Connect guide](https://github.com/archubbuck/accelerate/blob/main/docs/oidc.md) for provider sign-in and session integration. See [tenant and resource authorization](https://github.com/archubbuck/accelerate/blob/main/docs/scoped-authorization.md) for scoped grants and UI snapshots. See [service principals and API keys](https://github.com/archubbuck/accelerate/blob/main/docs/service-principals.md) for machine authentication.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Replacement import |
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
