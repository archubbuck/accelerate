import { createLogger } from "@accelerate/logging-core";
import { createOtelTransport, activeTraceContext } from "@accelerate/logging-otel";
const logger = createLogger({ service: "logging-otel-demo", transports: [createOtelTransport()], getContext: activeTraceContext });
logger.info("Emitted through the configured OpenTelemetry API");
await logger.flush();
console.log("Configure an OpenTelemetry LoggerProvider/exporter to collect this event.");
