# @accelerate/logging-otel

Optional OpenTelemetry adapter for `@accelerate/logging-core`. Export structured log entries to an OpenTelemetry Logs API logger and inspect the active trace/span identifiers.

## Install

```sh
npm install @accelerate/logging-otel @accelerate/logging-core @opentelemetry/api @opentelemetry/api-logs
```

Your application must separately configure an OpenTelemetry SDK, logger provider, processor, and exporter for delivery to a collector or backend. Installing this package alone does not configure telemetry export.

## Quick start

```ts
import { createLogger } from "@accelerate/logging-core";
import { activeTraceContext, createOtelTransport } from "@accelerate/logging-otel";

const logger = createLogger({
  service: "payments-api",
  transports: [createOtelTransport({ instrumentationName: "payments-api" })]
});

logger.info("Payment accepted", { paymentId: "pay-123", ...activeTraceContext() });
await logger.flush();
```

## API

- `createOtelTransport({ instrumentationName?, logger? } = {})` returns a core `LogTransport`. Provide an existing OpenTelemetry Logs API logger or let the adapter obtain one from the global Logs API.
- `activeTraceContext()` returns `{ traceId, spanId }` when an active span exists, or `{}` otherwise.

The adapter maps core severity levels to OpenTelemetry severity numbers, emits the message as the log body, and flattens context values into attributes. Complex values are JSON-serialized. The transport uses the entry's timestamp; log delivery depends on your configured OpenTelemetry provider and exporter.

Trace IDs are **not** automatically injected into every log entry by this transport. Add `activeTraceContext()` to context when you need those identifiers.

[Source and issues](https://github.com/archubbuck/accelerate)
