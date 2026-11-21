# Accelerate Authorization

Framework-agnostic, TypeScript-first hybrid RBAC packages under the `@accelerate/` npm scope.

Permissions are defined in code; roles, grants, and user-role assignments are managed dynamically.

## Packages

- `@accelerate/authorization-core`: permission registry, RBAC engine, and storage contracts
- `@accelerate/authorization-angular`: Angular signals, DI, and authorization directives
- `@accelerate/authorization-react`: React provider, hooks, and permission components\n- `@accelerate/authorization-postgres`: PostgreSQL-backed roles, grants, and assignments

## Development

```sh
corepack enable
pnpm install
pnpm build
pnpm test
```

The memory adapter is intended for development and tests. Backend enforcement is required for protected operations; client-side checks only control presentation.

## AccessLab demo applications

The [AccessLab demo suite](apps/README.md) contains a Fastify API, React app, and Angular app. Each application installs the **published npm packages** independently rather than linking to monorepo source. The API demonstrates PostgreSQL-backed authorization, protected document operations, audited role administration, and demo identity switching.

Run the applications from `apps/demo-api`, `apps/demo-react`, and `apps/demo-angular` following the [setup instructions](apps/README.md). Published-package compatibility is checked in `.github/workflows/demo-ci.yml`.

## Logging packages (development)

The `feature/logging-packages` branch introduces `@accelerate/logging-core`, `@accelerate/logging-angular`, `@accelerate/logging-react`, `@accelerate/logging-node`, and `@accelerate/logging-otel`. See [logging architecture and examples](docs/logging.md) and [published npm consumer demos](apps/logging-README.md).

The demo apps require the logging packages to be published to npmjs.org first. Do not treat workspace builds as evidence that published-package consumer validation has passed.
