# @accelerate/logging-core

Framework-independent structured logging for TypeScript and JavaScript. Create explicit logger instances with configurable severity thresholds, contextual fields, sensitive-field redaction, and pluggable transports.

## Install

```sh
npm install @accelerate/logging-core
```

## Quick start

```ts
import { createLogger, createConsoleTransport } from "@accelerate/logging-core";

const logger = createLogger({
  service: "orders-api",
  environment: "production",
  level: "info",
  transports: [createConsoleTransport()],
  redact: ["customerEmail"]
});

logger.info("Service started", { port: 3000 });
const requestLogger = logger.child({ requestId: "req-123" });
requestLogger.warn("Slow request", { durationMs: 850 });
await logger.flush();
```

## API

- `createLogger(options)` creates an isolated logger; there is no global singleton.
- `logger.trace/debug/info/warn/error/fatal(message, context?)` emits structured records at or above the configured level.
- `logger.child(context)` creates a logger with additional persistent fields.
- `logger.flush()` waits for outstanding asynchronous writes and calls each transport's optional `flush`.
- `createConsoleTransport()` writes JSON records to console methods.
- `createMemoryTransport()` collects entries in `entries` and supports `clear()`, useful for tests.
- `LogTransport`, `LogEntry`, `Logger`, `LoggerOptions`, `LogFields`, `LogLevel`, and `LOG_LEVELS` are exported.

`LoggerOptions` requires `service`; optional fields include `environment`, `level` (default `info`), `context`, `transports`, `redact`, `getContext`, and `onTransportError`. Without explicit transports, the console transport is used.

Each entry includes an ISO timestamp, severity, message, service name, optional environment, and a `context` object. Field redaction is case-insensitive by key and includes common secret keys by default; custom keys can be added with `redact`. Do not assume arbitrary sensitive values embedded in messages or differently named fields are automatically removed.

## Custom transport

```ts
import { createLogger, type LogTransport } from "@accelerate/logging-core";

const transport: LogTransport = {
  write(entry) {
    // Forward the structured entry to your logging destination.
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
};
const logger = createLogger({ service: "worker", transports: [transport] });
```

For Node.js request-scoped context, React, Angular, and OpenTelemetry integrations, see the corresponding `@accelerate/logging-*` packages.

[Source and issues](https://github.com/archubbuck/accelerate)
