# @accelerate/logging-node

Node.js helpers for `@accelerate/logging-core`: request-scoped context with `AsyncLocalStorage`, a context-aware logger factory, and newline-delimited JSON stream output.

## Install

```sh
npm install @accelerate/logging-node @accelerate/logging-core
```

## Quick start

```ts
import { createNodeLogger, createStreamTransport, runWithLogContext } from "@accelerate/logging-node";

const logger = createNodeLogger({
  service: "orders-api",
  transports: [createStreamTransport(process.stdout)]
});

await runWithLogContext({ requestId: "req-123" }, async () => {
  logger.info("Handling request", { route: "/orders" });
  await Promise.resolve();
  logger.info("Request completed");
});

await logger.flush();
```

The `requestId` field is automatically included in log entries emitted inside the context, including asynchronous operations that preserve Node's async context.

## API

- `createNodeLogger(options)` creates a core logger that reads the active context when each entry is emitted.
- `runWithLogContext(context, callback)` executes a callback within a merged asynchronous context; returns the callback's result.
- `currentLogContext()` returns the current fields or an empty object.
- `createStreamTransport(stream)` writes one JSON log entry followed by a newline using the stream's `write` method.
- `createLogger` is re-exported from `@accelerate/logging-core`.

Use `runWithLogContext` at the request or job boundary to avoid mixing concurrent request metadata. A stream transport writes to the supplied stream; managing stream lifetime and backpressure is the application's responsibility.

[Source and issues](https://github.com/archubbuck/accelerate)
