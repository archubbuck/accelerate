# @accelerate/authorization-core

TypeScript-first role-based authorization (RBAC) engine with code-defined permissions and dynamically managed roles, grants, and user assignments. No framework or database is required.

## Install

```sh
npm install @accelerate/authorization-core
```

## Quick start

```ts
import { createAuthorization, definePermissions, MemoryAuthorizationStore } from "@accelerate/authorization-core";

const permissions = definePermissions({
  documents: {
    read: "View documents",
    edit: "Edit documents"
  }
});

const store = new MemoryAuthorizationStore();
const auth = createAuthorization({ permissions, store });

await auth.admin.createRole({ id: "reader", key: "reader", name: "Reader", active: true });
await auth.admin.grant("reader", "documents.read");
await auth.admin.assignRole("user-123", "reader");

const allowed = await auth.can("user-123", "documents.read"); // true
const decision = await auth.evaluate("user-123", "documents.edit");
// decision.allowed === false
```

## API

- `definePermissions(catalog)`: creates a typed permission registry from resource/action descriptions.
- `createAuthorization({ permissions, store })`: exposes `can`, `canAll`, `canAny`, `evaluate`, and `admin` operations.
- `MemoryAuthorizationStore`: in-memory store for tests, demos, and local development.
- `AuthorizationStore`: interface for persistent storage adapters, including `@accelerate/authorization-postgres`.

`canAll([])` returns `false`; unknown permissions are denied. An inactive role does not grant access. Permission checks are additive across assigned active roles.

**Security:** enforce permissions on the server for protected operations. Client-side visibility is not an authorization boundary. The core `admin` methods are low-level store operations; authenticate and authorize administrative callers before exposing them.

[Source and issues](https://github.com/archubbuck/devkit)
