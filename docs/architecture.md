# Authorization architecture

Permissions are code-defined with `definePermissions`. Role records, grants, and assignments are dynamic via an `AuthorizationStore` adapter. The server engine enforces default-deny authorization. Angular and React integrations consume an authenticated user's effective permission snapshot for presentation only; API endpoints must independently enforce authorization.

## Security constraints

- Never trust browser permission snapshots for API enforcement.
- Restrict `admin` methods to trusted server code with separately verified administrative authorization.
- Unknown permissions are denied and cannot be granted.
- Treat memory persistence as development-only.
- Clear frontend snapshots on session changes; never share cached grants between users.

## Planned production work

Transactional SQL adapters, authenticated admin endpoints, audit events, session-scoped snapshot invalidation, Angular route guards, SSR integration, and comprehensive framework integration tests.
