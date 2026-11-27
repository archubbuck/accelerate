# Accelerate SDK

Choose a package by capability. The SDK catalog has no runtime dependencies.

| Package | Capability | Availability |
| --- | --- | --- |
| [@accelerate/sdk](https://www.npmjs.com/package/@accelerate/sdk) | Find Accelerate packages, install examples and migration guides. | Preview candidate |
| `@accelerate/core` | Time, decimal arithmetic, validation and shared errors. | Planned |
| `@accelerate/identity` | Authentication, authorization, API keys and auditing. | Planned |
| [@accelerate/http](https://www.npmjs.com/package/@accelerate/http) | HTTP clients, Node adapters, resilience, rate limiting and OpenAPI. | Preview candidate |
| `@accelerate/data` | Database adapters, transactions, caches, migrations and coordination. | Planned |
| `@accelerate/messaging` | Events, jobs, workflows, scheduling and transactional outbox. | Planned |
| `@accelerate/observability` | Logging, metrics, tracing, diagnostics and health checks. | Planned |
| `@accelerate/config` | Configuration, secrets and feature flags. | Planned |
| `@accelerate/ui` | Framework-neutral state, forms, notifications and tables. | Planned |
| `@accelerate/react` | React bindings for Accelerate. | Planned |
| `@accelerate/angular` | Angular bindings for Accelerate. | Planned |
| `@accelerate/ai` | Model gateways, prompts, structured output, agents and evaluation. | Planned |
| `@accelerate/testing` | Fixtures, transport helpers, contract and architecture tests. | Planned |
| `@accelerate/tooling` | Scaffolding, agent operations, AST tools and developer presets. | Planned |

Once published, install the HTTP preview with `npm install @accelerate/http@next`.

## Import migration

Change the package specifier for mapped imports. For other packages, the table gives the planned family. Existing package versions remain available.

| Existing package | Planned family | Preview import |
| --- | --- | --- |
| `@accelerate/agents-core` | `@accelerate/ai` | Pending |
| `@accelerate/ai-core` | `@accelerate/ai` | Pending |
| `@accelerate/ai-evaluation` | `@accelerate/ai` | Pending |
| `@accelerate/ai-gateway` | `@accelerate/ai` | Pending |
| `@accelerate/ai-prompts` | `@accelerate/ai` | Pending |
| `@accelerate/ai-structured` | `@accelerate/ai` | Pending |
| `@accelerate/ai-tools` | `@accelerate/ai` | Pending |
| `@accelerate/ai-usage` | `@accelerate/ai` | Pending |
| `@accelerate/api-keys` | `@accelerate/identity` | Pending |
| `@accelerate/audit-core` | `@accelerate/identity` | Pending |
| `@accelerate/audit-postgres` | `@accelerate/identity` | Pending |
| `@accelerate/authentication-angular` | `@accelerate/angular` | Pending |
| `@accelerate/authentication-core` | `@accelerate/identity` | Pending |
| `@accelerate/authentication-node` | `@accelerate/identity` | Pending |
| `@accelerate/authentication-postgres` | `@accelerate/identity` | Pending |
| `@accelerate/authentication-react` | `@accelerate/react` | Pending |
| `@accelerate/authorization-angular` | `@accelerate/angular` | Pending |
| `@accelerate/authorization-core` | `@accelerate/identity` | Pending |
| `@accelerate/authorization-postgres` | `@accelerate/identity` | Pending |
| `@accelerate/authorization-react` | `@accelerate/react` | Pending |
| `@accelerate/cache-core` | `@accelerate/data` | Pending |
| `@accelerate/cache-memory` | `@accelerate/data` | Pending |
| `@accelerate/cache-redis` | `@accelerate/data` | Pending |
| `@accelerate/config-angular` | `@accelerate/angular` | Pending |
| `@accelerate/config-core` | `@accelerate/config` | Pending |
| `@accelerate/config-node` | `@accelerate/config` | Pending |
| `@accelerate/config-react` | `@accelerate/react` | Pending |
| `@accelerate/contracts-openapi` | `@accelerate/http` | `@accelerate/http/openapi` |
| `@accelerate/create-accelerate` | `@accelerate/tooling` | Pending |
| `@accelerate/data-core` | `@accelerate/data` | Pending |
| `@accelerate/data-postgres` | `@accelerate/data` | Pending |
| `@accelerate/data-prisma` | `@accelerate/data` | Pending |
| `@accelerate/data-sqlserver` | `@accelerate/data` | Pending |
| `@accelerate/decimal-core` | `@accelerate/core` | Pending |
| `@accelerate/diagnostics-core` | `@accelerate/observability` | Pending |
| `@accelerate/errors-core` | `@accelerate/core` | Pending |
| `@accelerate/eslint-config` | `@accelerate/tooling` | Pending |
| `@accelerate/events-core` | `@accelerate/messaging` | Pending |
| `@accelerate/events-memory` | `@accelerate/messaging` | Pending |
| `@accelerate/events-postgres` | `@accelerate/messaging` | Pending |
| `@accelerate/events-redis` | `@accelerate/messaging` | Pending |
| `@accelerate/feature-flags-core` | `@accelerate/config` | Pending |
| `@accelerate/feature-flags-memory` | `@accelerate/config` | Pending |
| `@accelerate/feature-flags-postgres` | `@accelerate/config` | Pending |
| `@accelerate/forms-angular` | `@accelerate/angular` | Pending |
| `@accelerate/forms-core` | `@accelerate/ui` | Pending |
| `@accelerate/forms-react` | `@accelerate/react` | Pending |
| `@accelerate/health-core` | `@accelerate/observability` | Pending |
| `@accelerate/health-node` | `@accelerate/observability` | Pending |
| `@accelerate/http-angular` | `@accelerate/angular` | Pending |
| `@accelerate/http-client` | `@accelerate/http` | `@accelerate/http/client` |
| `@accelerate/http-core` | `@accelerate/http` | `@accelerate/http/core` |
| `@accelerate/http-node` | `@accelerate/http` | `@accelerate/http/node` |
| `@accelerate/http-react` | `@accelerate/react` | Pending |
| `@accelerate/idempotency-core` | `@accelerate/data` | Pending |
| `@accelerate/idempotency-memory` | `@accelerate/data` | Pending |
| `@accelerate/idempotency-postgres` | `@accelerate/data` | Pending |
| `@accelerate/jobs-core` | `@accelerate/messaging` | Pending |
| `@accelerate/jobs-postgres` | `@accelerate/messaging` | Pending |
| `@accelerate/locking-core` | `@accelerate/data` | Pending |
| `@accelerate/locking-memory` | `@accelerate/data` | Pending |
| `@accelerate/locking-postgres` | `@accelerate/data` | Pending |
| `@accelerate/logging-angular` | `@accelerate/angular` | Pending |
| `@accelerate/logging-core` | `@accelerate/observability` | Pending |
| `@accelerate/logging-node` | `@accelerate/observability` | Pending |
| `@accelerate/logging-otel` | `@accelerate/observability` | Pending |
| `@accelerate/logging-react` | `@accelerate/react` | Pending |
| `@accelerate/metrics-core` | `@accelerate/observability` | Pending |
| `@accelerate/metrics-otel` | `@accelerate/observability` | Pending |
| `@accelerate/migrations-core` | `@accelerate/data` | Pending |
| `@accelerate/migrations-postgres` | `@accelerate/data` | Pending |
| `@accelerate/notifications-core` | `@accelerate/ui` | Pending |
| `@accelerate/outbox-core` | `@accelerate/messaging` | Pending |
| `@accelerate/outbox-postgres` | `@accelerate/messaging` | Pending |
| `@accelerate/rate-limit-core` | `@accelerate/http` | `@accelerate/http/rate-limit` |
| `@accelerate/rate-limit-memory` | `@accelerate/http` | `@accelerate/http/rate-limit/memory` |
| `@accelerate/rate-limit-postgres` | `@accelerate/http` | `@accelerate/http/rate-limit/postgres` |
| `@accelerate/rate-limit-redis` | `@accelerate/http` | `@accelerate/http/rate-limit/redis` |
| `@accelerate/resilience-core` | `@accelerate/http` | `@accelerate/http/resilience` |
| `@accelerate/scheduler-core` | `@accelerate/messaging` | Pending |
| `@accelerate/scheduler-postgres` | `@accelerate/messaging` | Pending |
| `@accelerate/secrets-core` | `@accelerate/config` | Pending |
| `@accelerate/security-core` | `@accelerate/identity` | Pending |
| `@accelerate/state-angular` | `@accelerate/angular` | Pending |
| `@accelerate/state-core` | `@accelerate/ui` | Pending |
| `@accelerate/state-react` | `@accelerate/react` | Pending |
| `@accelerate/tables-angular` | `@accelerate/angular` | Pending |
| `@accelerate/tables-core` | `@accelerate/ui` | Pending |
| `@accelerate/tables-react` | `@accelerate/react` | Pending |
| `@accelerate/testing-architecture` | `@accelerate/testing` | Pending |
| `@accelerate/testing-contracts` | `@accelerate/testing` | Pending |
| `@accelerate/testing-core` | `@accelerate/testing` | Pending |
| `@accelerate/testing-fixtures` | `@accelerate/testing` | Pending |
| `@accelerate/testing-http` | `@accelerate/testing` | Pending |
| `@accelerate/testing-postgres` | `@accelerate/testing` | Pending |
| `@accelerate/time-core` | `@accelerate/core` | Pending |
| `@accelerate/tooling-ast` | `@accelerate/tooling` | Pending |
| `@accelerate/tooling-core` | `@accelerate/tooling` | Pending |
| `@accelerate/tooling-patches` | `@accelerate/tooling` | Pending |
| `@accelerate/tooling-project` | `@accelerate/tooling` | Pending |
| `@accelerate/tooling-registry` | `@accelerate/tooling` | Pending |
| `@accelerate/tracing-core` | `@accelerate/observability` | Pending |
| `@accelerate/tracing-otel` | `@accelerate/observability` | Pending |
| `@accelerate/transactions` | `@accelerate/data` | Pending |
| `@accelerate/typescript-config` | `@accelerate/tooling` | Pending |
| `@accelerate/validation-core` | `@accelerate/core` | Pending |
| `@accelerate/workflows-core` | `@accelerate/messaging` | Pending |
| `@accelerate/workflows-memory` | `@accelerate/messaging` | Pending |
| `@accelerate/workflows-postgres` | `@accelerate/messaging` | Pending |
