# Accelerate logging packages

Five packages: `@accelerate/logging-core`, `-angular`, `-react`, `-node`, and `-otel`.

The core is framework-independent. All adapters use the same structured event schema and transport contract.

## Core example

```ts
import { createLogger, createMemoryTransport } from "@accelerate/logging-core";
const transport = createMemoryTransport();
const logger = createLogger({ service: "example", level: "debug", transports: [transport] });
logger.child({ component: "authorization" }).info("Permission evaluated", { granted: true });
await logger.flush();
```

## Node context

```ts
import { createNodeLogger, runWithLogContext } from "@accelerate/logging-node";
const logger = createNodeLogger({ service: "api" });
runWithLogContext({ correlationId: "request-123" }, () => logger.info("Request received"));
```

## React

Wrap the app in `<LoggingProvider logger={logger}>` and use `useLogger("Component")`.

## Angular

Register `provideLogging({ service: "angular-app" })` in application providers and use `injectLogger("Component")` in an injection context.

## OpenTelemetry

Configure the OTel SDK in the host application; pass `createOtelTransport()` to the core logger. For trace correlation, supply `getContext: activeTraceContext`. No SDK is started as a side effect of importing the package.

## Security and delivery

Sensitive field names are redacted recursively before transport dispatch. Avoid embedding secrets in free-text messages. Async transports are best-effort and `flush()` waits for pending writes; it does not guarantee remote durability. Transport errors are isolated from business logic.

## Distribution

The source packages use the existing pnpm workspace and npm public registry configuration. The existing publish workflow must be extended to include these five packages, with core published first. Demo apps deliberately live outside the workspace and install from npm only after packages are published.
