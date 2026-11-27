# Accelerate React

React bindings for Accelerate.

Install with `npm install @accelerate/react`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

Use React 18 or newer and matching React declarations for TypeScript projects.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Replacement import |
| --- | --- |
| `@accelerate/authentication-react` | `@accelerate/react/authentication` |
| `@accelerate/authorization-react` | `@accelerate/react/authorization` |
| `@accelerate/config-react` | `@accelerate/react/config` |
| `@accelerate/forms-react` | `@accelerate/react/forms` |
| `@accelerate/http-react` | `@accelerate/react/http` |
| `@accelerate/logging-react` | `@accelerate/react/logging` |
| `@accelerate/state-react` | `@accelerate/react/state` |
| `@accelerate/tables-react` | `@accelerate/react/tables` |
