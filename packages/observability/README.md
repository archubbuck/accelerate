# Accelerate Observability

Logging, metrics, tracing, diagnostics and health checks.

Once published, install with `npm install @accelerate/observability@next`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

Install the OpenTelemetry API and API Logs peers for the corresponding adapters.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Preview import |
| --- | --- |
| `@accelerate/diagnostics-core` | `@accelerate/observability/diagnostics` |
| `@accelerate/health-core` | `@accelerate/observability/health` |
| `@accelerate/health-node` | `@accelerate/observability/health/node` |
| `@accelerate/logging-core` | `@accelerate/observability/logging` |
| `@accelerate/logging-node` | `@accelerate/observability/logging/node` |
| `@accelerate/logging-otel` | `@accelerate/observability/logging/otel` |
| `@accelerate/metrics-core` | `@accelerate/observability/metrics` |
| `@accelerate/metrics-otel` | `@accelerate/observability/metrics/otel` |
| `@accelerate/tracing-core` | `@accelerate/observability/tracing` |
| `@accelerate/tracing-otel` | `@accelerate/observability/tracing/otel` |
