# Accelerate Authorization

Framework-agnostic, TypeScript-first hybrid RBAC packages under the `@accelerate/` npm scope.

Permissions are defined in code; roles, grants, and user-role assignments are managed dynamically.

## Packages

- `@accelerate/authorization-core`: permission registry, RBAC engine, and storage contracts
- `@accelerate/authorization-angular`: Angular signals, DI, and authorization directives
- `@accelerate/authorization-react`: React provider, hooks, and permission components\n- `@accelerate/authorization-postgres`: PostgreSQL-backed roles, grants, and assignments

## Development

```sh
corepack enable
pnpm install
pnpm build
pnpm test
```

The memory adapter is intended for development and tests. Backend enforcement is required for protected operations; client-side checks only control presentation.
