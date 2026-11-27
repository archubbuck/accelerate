# Tenant and resource authorization

Install `@accelerate/identity` and use the scoped evaluator from `@accelerate/identity/authorization/scoped`. Use the PostgreSQL adapter from `@accelerate/identity/authorization/postgres/scoped`. Apply `scopedAuthorizationSchema` after the existing authorization schema. Existing single-tenant RBAC continues to use `@accelerate/identity/authorization`.

Scopes are explicit. A global assignment grants global operations only. A tenant assignment grants matching tenant and resource operations inside that tenant. A resource assignment grants operations against its exact tenant, type, and ID. Resolve the active tenant from authenticated membership and load the target's scope from trusted server data.

```ts
import { createScopedAuthorization, ownerOnlyPolicy } from '@accelerate/identity/authorization/scoped';
import { createPostgresScopedGrantStore } from '@accelerate/identity/authorization/postgres/scoped';

const authorization = createScopedAuthorization({
  permissions,
  store: createPostgresScopedGrantStore(pool),
  policies: [ownerOnlyPolicy('document-owner', ['documents.write'])],
  authorizeAssignment: policyForRoleAdministrators,
});

const decision = await authorization.evaluate({
  subject: { id: session.identity.id, tenantId: membership.tenantId },
  scope: { kind: 'resource', tenantId: document.tenantId, resourceType: 'document', resourceId: document.id },
  ownerId: document.ownerId,
}, 'documents.write');
```

A policy can deny a role grant, while an allow or abstention lets the remaining policies run. Each authorization also needs an active role with the requested permission. Store and policy failures deny access. The decision includes a reason and the matching role keys for allowed checks.

Use `changeRole(actor, action, assignment)` with an explicit administrative policy. The PostgreSQL adapter records the actor and scope in the same statement as each actual assignment change. It stores role definitions and permission grants in the existing tables. Review role changes through the existing role administration workflow.

React's `AuthorizationProvider` accepts a `scopeKey` prop, and Angular's `AuthorizationService.refresh(scopeKey)` reloads a scoped snapshot. Have the backend echo the requested scope key in its response and return permissions computed for that scope. Both clients deny while loading and reject a response bearing another scope key. Use these snapshots for UI visibility and enforce access on the backend.
