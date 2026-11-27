# Service principals and API keys

Use `@accelerate/identity/api-keys/service` for machine identities. Apply `serviceCredentialSchema` from `@accelerate/identity/api-keys/postgres` after the audit schema. The service exposes principal creation, issue, rotation, revocation and deactivation. Set an administrative policy that checks both the action and the target tenant.

```ts
import { createServiceCredentials } from '@accelerate/identity/api-keys/service';
import { createPostgresServiceCredentialStore } from '@accelerate/identity/api-keys/postgres';

const services = createServiceCredentials({
  store: createPostgresServiceCredentialStore(db),
  permissions: permissions.keys,
  authorize: authorizeServiceAdministrator,
});

const principal = await services.createPrincipal(actorId, { tenantId, name: 'Reconciler' });
const { token } = await services.issue(
  actorId, principal.id, ['transactions.read'], new Date(Date.now() + 86400000),
);
```

Deliver the plaintext token once and transmit it using an HTTPS `Authorization: Bearer` header. Store it in the caller's secret manager. Keep tokens and authorization headers out of logs. The database holds a digest, a random lookup prefix, lifecycle timestamps, and the credential's permission scope. Rotation revokes the prior key and issues its scoped replacement in one transaction. Separate keys for one principal can be revoked independently.

Authenticate the header in server middleware. Require both the permission on the credential and the role permission for that principal, tenant, and resource before continuing. Reserve the generated `svc_` namespace for machine subjects.

```ts
const machine = await services.authenticate(request.headers.authorization);
if (!machine) return unauthorized();
if (!machine.permissions.includes('transactions.read')) return forbidden();

const allowed = await authorization.can({
  subject: { id: machine.principal.id, tenantId: machine.principal.tenantId },
  scope: { kind: 'resource', tenantId: transaction.tenantId, resourceType: 'transaction', resourceId: transaction.id },
}, 'transactions.read');
if (!allowed) return forbidden();
```

Successful administrative changes use the existing audit table and record an actor, principal and credential ID as applicable. Attribute downstream machine actions to the authenticated principal ID and credential ID. The store records last use only while the credential and principal are active. Apply request rate limits independently and return generic authentication errors.
