# Accelerate Messaging

Events, jobs, workflows, scheduling and transactional outbox.

Once published, install with `npm install @accelerate/messaging@next`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Preview import |
| --- | --- |
| `@accelerate/events-core` | `@accelerate/messaging/events` |
| `@accelerate/events-memory` | `@accelerate/messaging/events/memory` |
| `@accelerate/events-postgres` | `@accelerate/messaging/events/postgres` |
| `@accelerate/events-redis` | `@accelerate/messaging/events/redis` |
| `@accelerate/jobs-core` | `@accelerate/messaging/jobs` |
| `@accelerate/jobs-postgres` | `@accelerate/messaging/jobs/postgres` |
| `@accelerate/jobs-postgres/testing` | `@accelerate/messaging/jobs/postgres/testing` |
| `@accelerate/outbox-core` | `@accelerate/messaging/outbox` |
| `@accelerate/outbox-postgres` | `@accelerate/messaging/outbox/postgres` |
| `@accelerate/scheduler-core` | `@accelerate/messaging/scheduler` |
| `@accelerate/scheduler-postgres` | `@accelerate/messaging/scheduler/postgres` |
| `@accelerate/workflows-core` | `@accelerate/messaging/workflows` |
| `@accelerate/workflows-memory` | `@accelerate/messaging/workflows/memory` |
| `@accelerate/workflows-postgres` | `@accelerate/messaging/workflows/postgres` |
