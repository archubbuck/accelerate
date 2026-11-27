# Accelerate SDK

Find Accelerate packages, install examples and migration guides.

Once published, install a preview by appending `@next` to the npm package name. For example, run `npm install @accelerate/http@next`.

| Package | Capability |
| --- | --- |
| [@accelerate/sdk](https://www.npmjs.com/package/@accelerate/sdk) | Find Accelerate packages, install examples and migration guides. |
| [@accelerate/core](https://www.npmjs.com/package/@accelerate/core) | Time, decimal arithmetic, validation and shared errors. |
| [@accelerate/identity](https://www.npmjs.com/package/@accelerate/identity) | Authentication, authorization, API keys and auditing. |
| [@accelerate/http](https://www.npmjs.com/package/@accelerate/http) | HTTP clients, Node adapters, resilience, rate limiting and OpenAPI. |
| [@accelerate/data](https://www.npmjs.com/package/@accelerate/data) | Database adapters, transactions, caches, migrations and coordination. |
| [@accelerate/messaging](https://www.npmjs.com/package/@accelerate/messaging) | Events, jobs, workflows, scheduling and transactional outbox. |
| [@accelerate/observability](https://www.npmjs.com/package/@accelerate/observability) | Logging, metrics, tracing, diagnostics and health checks. |
| [@accelerate/config](https://www.npmjs.com/package/@accelerate/config) | Configuration, secrets and feature flags. |
| [@accelerate/ui](https://www.npmjs.com/package/@accelerate/ui) | Framework-neutral state, forms, notifications and tables. |
| [@accelerate/react](https://www.npmjs.com/package/@accelerate/react) | React bindings for Accelerate. |
| [@accelerate/angular](https://www.npmjs.com/package/@accelerate/angular) | Angular bindings for Accelerate. |
| [@accelerate/ai](https://www.npmjs.com/package/@accelerate/ai) | Model gateways, prompts, structured output, agents and evaluation. |
| [@accelerate/testing](https://www.npmjs.com/package/@accelerate/testing) | Fixtures, transport helpers, contract and architecture tests. |
| [@accelerate/tooling](https://www.npmjs.com/package/@accelerate/tooling) | Scaffolding, agent operations, AST tools and developer presets. |

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Preview import |
| --- | --- |
| `@accelerate/agents-core` | `@accelerate/ai/agents` |
| `@accelerate/ai-core` | `@accelerate/ai/core` |
| `@accelerate/ai-evaluation` | `@accelerate/ai/evaluation` |
| `@accelerate/ai-gateway` | `@accelerate/ai/gateway` |
| `@accelerate/ai-prompts` | `@accelerate/ai/prompts` |
| `@accelerate/ai-structured` | `@accelerate/ai/structured` |
| `@accelerate/ai-tools` | `@accelerate/ai/tools` |
| `@accelerate/ai-usage` | `@accelerate/ai/usage` |
| `@accelerate/api-keys` | `@accelerate/identity/api-keys` |
| `@accelerate/audit-core` | `@accelerate/identity/audit` |
| `@accelerate/audit-postgres` | `@accelerate/identity/audit/postgres` |
| `@accelerate/authentication-angular` | `@accelerate/angular/authentication` |
| `@accelerate/authentication-core` | `@accelerate/identity/authentication` |
| `@accelerate/authentication-node` | `@accelerate/identity/authentication/node` |
| `@accelerate/authentication-postgres` | `@accelerate/identity/authentication/postgres` |
| `@accelerate/authentication-react` | `@accelerate/react/authentication` |
| `@accelerate/authorization-angular` | `@accelerate/angular/authorization` |
| `@accelerate/authorization-core` | `@accelerate/identity/authorization` |
| `@accelerate/authorization-postgres` | `@accelerate/identity/authorization/postgres` |
| `@accelerate/authorization-postgres/admin` | `@accelerate/identity/authorization/postgres/admin` |
| `@accelerate/authorization-react` | `@accelerate/react/authorization` |
| `@accelerate/cache-core` | `@accelerate/data/cache` |
| `@accelerate/cache-memory` | `@accelerate/data/cache/memory` |
| `@accelerate/cache-redis` | `@accelerate/data/cache/redis` |
| `@accelerate/config-angular` | `@accelerate/angular/config` |
| `@accelerate/config-core` | `@accelerate/config/config` |
| `@accelerate/config-node` | `@accelerate/config/config/node` |
| `@accelerate/config-react` | `@accelerate/react/config` |
| `@accelerate/contracts-openapi` | `@accelerate/http/openapi` |
| `@accelerate/create-accelerate` | `@accelerate/tooling/create` |
| `@accelerate/data-core` | `@accelerate/data/core` |
| `@accelerate/data-postgres` | `@accelerate/data/postgres` |
| `@accelerate/data-prisma` | `@accelerate/data/prisma` |
| `@accelerate/data-sqlserver` | `@accelerate/data/sqlserver` |
| `@accelerate/decimal-core` | `@accelerate/core/decimal` |
| `@accelerate/diagnostics-core` | `@accelerate/observability/diagnostics` |
| `@accelerate/errors-core` | `@accelerate/core/errors` |
| `@accelerate/eslint-config` | `@accelerate/tooling/eslint` |
| `@accelerate/events-core` | `@accelerate/messaging/events` |
| `@accelerate/events-memory` | `@accelerate/messaging/events/memory` |
| `@accelerate/events-postgres` | `@accelerate/messaging/events/postgres` |
| `@accelerate/events-redis` | `@accelerate/messaging/events/redis` |
| `@accelerate/feature-flags-core` | `@accelerate/config/flags` |
| `@accelerate/feature-flags-memory` | `@accelerate/config/flags/memory` |
| `@accelerate/feature-flags-postgres` | `@accelerate/config/flags/postgres` |
| `@accelerate/forms-angular` | `@accelerate/angular/forms` |
| `@accelerate/forms-core` | `@accelerate/ui/forms` |
| `@accelerate/forms-react` | `@accelerate/react/forms` |
| `@accelerate/health-core` | `@accelerate/observability/health` |
| `@accelerate/health-node` | `@accelerate/observability/health/node` |
| `@accelerate/http-angular` | `@accelerate/angular/http` |
| `@accelerate/http-client` | `@accelerate/http/client` |
| `@accelerate/http-core` | `@accelerate/http/core` |
| `@accelerate/http-node` | `@accelerate/http/node` |
| `@accelerate/http-react` | `@accelerate/react/http` |
| `@accelerate/idempotency-core` | `@accelerate/data/idempotency` |
| `@accelerate/idempotency-memory` | `@accelerate/data/idempotency/memory` |
| `@accelerate/idempotency-postgres` | `@accelerate/data/idempotency/postgres` |
| `@accelerate/jobs-core` | `@accelerate/messaging/jobs` |
| `@accelerate/jobs-postgres` | `@accelerate/messaging/jobs/postgres` |
| `@accelerate/jobs-postgres/testing` | `@accelerate/messaging/jobs/postgres/testing` |
| `@accelerate/locking-core` | `@accelerate/data/locking` |
| `@accelerate/locking-memory` | `@accelerate/data/locking/memory` |
| `@accelerate/locking-postgres` | `@accelerate/data/locking/postgres` |
| `@accelerate/logging-angular` | `@accelerate/angular/logging` |
| `@accelerate/logging-core` | `@accelerate/observability/logging` |
| `@accelerate/logging-node` | `@accelerate/observability/logging/node` |
| `@accelerate/logging-otel` | `@accelerate/observability/logging/otel` |
| `@accelerate/logging-react` | `@accelerate/react/logging` |
| `@accelerate/metrics-core` | `@accelerate/observability/metrics` |
| `@accelerate/metrics-otel` | `@accelerate/observability/metrics/otel` |
| `@accelerate/migrations-core` | `@accelerate/data/migrations` |
| `@accelerate/migrations-postgres` | `@accelerate/data/migrations/postgres` |
| `@accelerate/notifications-core` | `@accelerate/ui/notifications` |
| `@accelerate/outbox-core` | `@accelerate/messaging/outbox` |
| `@accelerate/outbox-postgres` | `@accelerate/messaging/outbox/postgres` |
| `@accelerate/rate-limit-core` | `@accelerate/http/rate-limit` |
| `@accelerate/rate-limit-memory` | `@accelerate/http/rate-limit/memory` |
| `@accelerate/rate-limit-postgres` | `@accelerate/http/rate-limit/postgres` |
| `@accelerate/rate-limit-redis` | `@accelerate/http/rate-limit/redis` |
| `@accelerate/resilience-core` | `@accelerate/http/resilience` |
| `@accelerate/scheduler-core` | `@accelerate/messaging/scheduler` |
| `@accelerate/scheduler-postgres` | `@accelerate/messaging/scheduler/postgres` |
| `@accelerate/secrets-core` | `@accelerate/config/secrets` |
| `@accelerate/security-core` | `@accelerate/identity/security` |
| `@accelerate/state-angular` | `@accelerate/angular/state` |
| `@accelerate/state-core` | `@accelerate/ui/state` |
| `@accelerate/state-react` | `@accelerate/react/state` |
| `@accelerate/tables-angular` | `@accelerate/angular/tables` |
| `@accelerate/tables-core` | `@accelerate/ui/tables` |
| `@accelerate/tables-react` | `@accelerate/react/tables` |
| `@accelerate/testing-architecture` | `@accelerate/testing/architecture` |
| `@accelerate/testing-contracts` | `@accelerate/testing/contracts` |
| `@accelerate/testing-core` | `@accelerate/testing/core` |
| `@accelerate/testing-fixtures` | `@accelerate/testing/fixtures` |
| `@accelerate/testing-http` | `@accelerate/testing/http` |
| `@accelerate/testing-postgres` | `@accelerate/testing/postgres` |
| `@accelerate/time-core` | `@accelerate/core/time` |
| `@accelerate/tooling-ast` | `@accelerate/tooling/ast` |
| `@accelerate/tooling-core` | `@accelerate/tooling/core` |
| `@accelerate/tooling-patches` | `@accelerate/tooling/patches` |
| `@accelerate/tooling-project` | `@accelerate/tooling/project` |
| `@accelerate/tooling-registry` | `@accelerate/tooling/registry` |
| `@accelerate/tracing-core` | `@accelerate/observability/tracing` |
| `@accelerate/tracing-otel` | `@accelerate/observability/tracing/otel` |
| `@accelerate/transactions` | `@accelerate/data/transactions` |
| `@accelerate/typescript-config/base.json` | `@accelerate/tooling/tsconfig/base.json` |
| `@accelerate/typescript-config/library.json` | `@accelerate/tooling/tsconfig/library.json` |
| `@accelerate/validation-core` | `@accelerate/core/validation` |
| `@accelerate/workflows-core` | `@accelerate/messaging/workflows` |
| `@accelerate/workflows-memory` | `@accelerate/messaging/workflows/memory` |
| `@accelerate/workflows-postgres` | `@accelerate/messaging/workflows/postgres` |
