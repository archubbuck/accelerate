# DevKit Authorization

Framework-agnostic, TypeScript-first hybrid RBAC packages under the `@devkit/` npm scope.

Permissions are defined in code; roles, grants, and user-role assignments are managed dynamically.

## Packages

- `@devkit/authorization-core`: permission registry, RBAC engine, and storage contracts
- `@devkit/authorization-angular`: Angular signals, DI, and authorization directives
- `@devkit/authorization-react`: React provider, hooks, and permission components

## Development

```sh
corepack enable
pnpm install
pnpm build
pnpm test
```

The memory adapter is intended for development and tests. Backend enforcement is required for protected operations; client-side checks only control presentation.
