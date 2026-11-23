# Accelerate

**Accelerate** is a TypeScript monorepo of reusable, independently published npm packages for application development. The `@accelerate` scope currently includes **authorization** and **structured logging** libraries, with framework-specific integrations for Angular, React, and Node.js.

Packages are designed to be consumed independently. The repository also contains standalone demo applications that install the **published npm artifacts** rather than linking to workspace source.

## Packages

### Authorization

Define permissions in code and manage roles, grants, and user assignments dynamically. Enforce authorization on the server; frontend integrations are for presentation.

| Package | Purpose | Documentation |
| --- | --- | --- |
| [`@accelerate/authorization-core`](https://www.npmjs.com/package/@accelerate/authorization-core) | Framework-independent RBAC engine, permission definitions, and storage contracts | [README](packages/authorization-core/README.md) |
| [`@accelerate/authorization-postgres`](https://www.npmjs.com/package/@accelerate/authorization-postgres) | PostgreSQL-backed roles, grants, and assignments | [README](packages/authorization-postgres/README.md) |
| [`@accelerate/authorization-react`](https://www.npmjs.com/package/@accelerate/authorization-react) | React provider, hooks, and permission-aware components | [README](packages/authorization-react/README.md) |
| [`@accelerate/authorization-angular`](https://www.npmjs.com/package/@accelerate/authorization-angular) | Angular dependency injection, signals, and authorization directives | [README](packages/authorization-angular/README.md) |

### Logging

Emit structured logs through a framework-neutral logger and optional platform adapters. Configure log levels, context, sensitive-field redaction, and transports without a global logger.

| Package | Purpose | Documentation |
| --- | --- | --- |
| [`@accelerate/logging-core`](https://www.npmjs.com/package/@accelerate/logging-core) | Structured logging, child loggers, redaction, and transports | [README](packages/logging-core/README.md) |
| [`@accelerate/logging-node`](https://www.npmjs.com/package/@accelerate/logging-node) | Node.js async request context and stream transport | [README](packages/logging-node/README.md) |
| [`@accelerate/logging-react`](https://www.npmjs.com/package/@accelerate/logging-react) | React logging provider and hook | [README](packages/logging-react/README.md) |
| [`@accelerate/logging-angular`](https://www.npmjs.com/package/@accelerate/logging-angular) | Angular DI integration and optional error handler | [README](packages/logging-angular/README.md) |
| [`@accelerate/logging-otel`](https://www.npmjs.com/package/@accelerate/logging-otel) | OpenTelemetry Logs API transport and active trace context | [README](packages/logging-otel/README.md) |

See the [logging architecture and examples](docs/logging.md) for cross-package usage. Check npm for the availability of a package version before installing it; source code and documentation may precede publication.

## Package registry

The [package registry](registry/README.md) tracks implemented and proposed packages, lifecycle status, priorities, and roadmap waves. Browse the [generated package catalog](docs/package-registry.md).

```sh
pnpm registry:validate
pnpm registry:list
pnpm registry:show -- errors-core
pnpm registry:roadmap
pnpm registry:report
pnpm registry:graph
pnpm registry:docs
pnpm registry:next
pnpm registry:search -- authentication
pnpm registry:readiness
pnpm registry:agent-context -- http
```

Every new workspace package must have a registry entry. The dedicated registry GitHub Actions workflow validates workspace coverage and generated documentation.

## Quick start

Install only the libraries your application needs:

```sh
npm install @accelerate/logging-core
```

```ts
import { createLogger } from "@accelerate/logging-core";

const logger = createLogger({ service: "my-service", level: "info" });
logger.info("Application started", { component: "bootstrap" });
```

For authorization examples and setup, start with [authorization-core](packages/authorization-core/README.md). For logging integrations, see the package-specific READMEs above.

## Repository development

**Prerequisites:** Node.js 24, pnpm 9.15.4, and Corepack. Some authorization tests and demos require PostgreSQL; see the relevant demo instructions.

```sh
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

The root scripts run across the pnpm workspace. Applications under `apps/` are independent npm consumers and are intentionally not part of the workspace.

## Demo applications

| Suite | Applications | Guide |
| --- | --- | --- |
| **AccessLab (authorization)** | Fastify API, React frontend, Angular frontend | [Authorization demos](apps/README.md) |
| **Logging** | Angular, React, Node.js, HTTP API, OpenTelemetry | [Logging demos](apps/logging-README.md) |

Demo apps verify compatibility with **published npm packages**, not only local source builds. Install dependencies within each app directory as described in its guide. The authorization API demo uses a dedicated PostgreSQL database; do not connect demo identity-switching or administrative features to production data.

## Publishing and verification

The repository provides manually triggered GitHub Actions workflows:

- [Bootstrap npm packages (one-time token)](.github/workflows/bootstrap-npm.yml): initial publication of package names that are not yet on npm.
- [Publish npm packages](.github/workflows/publish.yml): builds, typechecks, tests, and publishes unpublished versions using npm trusted publishing (OIDC).
- [Authorization demo CI](.github/workflows/demo-ci.yml) and [Logging demo CI](.github/workflows/logging-demo-ci.yml): independently validate npm-installed consumer applications.

Each package version is immutable on npm: bump the version before republishing changed code or README content. Configure npm trusted publishing **for each package** before using the normal publish workflow; new package names may require token-based bootstrap first. The publish workflow skips versions that already exist in the registry.

## Security and support

- Enforce authorization at the backend. Client-side permission checks are not a security boundary.
- Configure logging redaction and avoid placing secrets in free-text log messages. Transport delivery is best-effort unless your application provides stronger guarantees.
- OpenTelemetry export requires an SDK/exporter configured by the consuming application.

[Report an issue or request a feature](https://github.com/archubbuck/accelerate/issues) · [Browse source](https://github.com/archubbuck/accelerate)
