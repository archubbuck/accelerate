# @accelerate/authorization-react

React provider, hooks, and conditional rendering for authorization snapshots. Use alongside a backend that enforces permissions.

## Install

```sh
npm install @accelerate/authorization-react
```

React 18 or newer is a peer dependency.

## Quick start

```tsx
import { AuthorizationProvider, Can, useAuthorization } from "@accelerate/authorization-react";

const client = {
  async load() {
    const response = await fetch("/api/authorization/me", { credentials: "include" });
    if (!response.ok) throw new Error("Unable to load authorization");
    return response.json();
  }
};

function DocumentActions() {
  const { status, can, refresh, reset } = useAuthorization();
  return (
    <div>
      <span>{status}</span>
      {can("documents.read") && <span>Documents available</span>}
      <Can permission="documents.edit" fallback={<span>Read only</span>}>
        <button>Edit document</button>
      </Can>
      <button onClick={() => void refresh()}>Refresh permissions</button>
      <button onClick={reset}>Clear authorization</button>
    </div>
  );
}

export function App() {
  return (
    <AuthorizationProvider client={client}>
      <DocumentActions />
    </AuthorizationProvider>
  );
}
```

## Snapshot format

The `client.load()` method must return a promise resolving to:

```json
{
  "userId": "user-123",
  "roles": ["editor"],
  "permissions": ["documents.read", "documents.edit"]
}
```

The provider loads on mount and exposes `status` (`idle`, `loading`, `ready`, `error`), `userId`, `roles`, `permissions`, `can`, `canAny`, `canAll`, `refresh`, and `reset` through `useAuthorization()`. `usePermission("documents.read")` returns a boolean. `<Can>` accepts `permission`, `anyOf`, or `allOf` and an optional `fallback`.

Checks deny access until a valid snapshot is ready; `canAll([])` returns false. Call `reset()` on logout and `refresh()` when identity or permissions change.

**Security:** this package controls UI presentation only. Your backend must authorize every protected request.

[Source and issues](https://github.com/archubbuck/accelerate)
