import { context, trace } from "@opentelemetry/api";
import { logs, SeverityNumber, type Logger as OtelLogger } from "@opentelemetry/api-logs";
import type { LogEntry, LogTransport } from "@accelerate/logging-core";
const severity = { trace: SeverityNumber.TRACE, debug: SeverityNumber.DEBUG, info: SeverityNumber.INFO, warn: SeverityNumber.WARN, error: SeverityNumber.ERROR, fatal: SeverityNumber.FATAL };
export function activeTraceContext(): Record<string, string> {
  const span = trace.getSpan(context.active())?.spanContext();
  return span ? { traceId: span.traceId, spanId: span.spanId } : {};
}
export function createOtelTransport(options: { instrumentationName?: string; logger?: OtelLogger } = {}): LogTransport {
  const logger = options.logger ?? logs.getLogger(options.instrumentationName ?? "@accelerate/logging-otel");
  return { write(entry: LogEntry) {
    logger.emit({ severityNumber: severity[entry.level], severityText: entry.level.toUpperCase(), body: entry.message,
      attributes: { service: entry.service, ...(entry.environment ? { environment: entry.environment } : {}), ...flatten(entry.context) },
      timestamp: new Date(entry.timestamp) });
  } };
}
function flatten(fields: Record<string, unknown>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value;
    else if (value != null) result[key] = JSON.stringify(value);
  }
  return result;
}
