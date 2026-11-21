/** Framework-neutral structured logging. No global logger or platform dependencies. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export const LOG_LEVELS: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];
export type LogFields = Readonly<Record<string, unknown>>;
export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly service: string;
  readonly environment?: string;
  readonly context: LogFields;
}
export interface LogTransport {
  write(entry: LogEntry): void | Promise<void>;
  flush?(): void | Promise<void>;
}
export interface Logger {
  trace(message: string, context?: LogFields): void;
  debug(message: string, context?: LogFields): void;
  info(message: string, context?: LogFields): void;
  warn(message: string, context?: LogFields): void;
  error(message: string, context?: LogFields): void;
  fatal(message: string, context?: LogFields): void;
  child(context: LogFields): Logger;
  flush(): Promise<void>;
}
export interface LoggerOptions {
  service: string;
  environment?: string;
  level?: LogLevel;
  context?: LogFields;
  transports?: readonly LogTransport[];
  redact?: readonly string[];
  /** Optional request-scoped metadata provider; invoked at emission time. */
  getContext?: () => LogFields;
  onTransportError?: (error: unknown) => void;
}
const DEFAULT_REDACT = ["password", "authorization", "cookie", "set-cookie", "token", "accessToken", "refreshToken", "apiKey", "secret"];
const rank = (level: LogLevel) => LOG_LEVELS.indexOf(level);
function sanitize(value: unknown, sensitive: ReadonlySet<string>, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 12) return "[MaxDepth]";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return "[Unsupported]";
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Error) {
    const result = sanitize({ name: value.name, message: value.message, stack: value.stack, cause: value.cause }, sensitive, seen, depth + 1);
    seen.delete(value);
    return result;
  }
  if (Array.isArray(value)) {
    const result = value.slice(0, 200).map(item => sanitize(item, sensitive, seen, depth + 1));
    seen.delete(value);
    return result;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 200)) {
    result[key] = sensitive.has(key.toLowerCase()) ? "[REDACTED]" : sanitize(item, sensitive, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}
export function createConsoleTransport(): LogTransport {
  return { write(entry) {
    const line = JSON.stringify(entry);
    if (entry.level === "error" || entry.level === "fatal") console.error(line);
    else if (entry.level === "warn") console.warn(line);
    else console.log(line);
  } };
}
export function createMemoryTransport(): LogTransport & { readonly entries: LogEntry[]; clear(): void } {
  const entries: LogEntry[] = [];
  return { entries, write: entry => { entries.push(entry); }, clear: () => { entries.length = 0; } };
}
export function createLogger(options: LoggerOptions): Logger {
  if (!options.service?.trim()) throw new Error("Logging service must be nonempty");
  const threshold = options.level ?? "info";
  if (rank(threshold) < 0) throw new Error("Invalid logging level");
  const transports = options.transports ?? [createConsoleTransport()];
  const sensitive = new Set([...DEFAULT_REDACT, ...(options.redact ?? [])].map(key => key.toLowerCase()));
  const pending = new Set<Promise<void>>();
  const report = (error: unknown) => { try { options.onTransportError?.(error); } catch { /* never fail business logic */ } };
  const make = (base: LogFields): Logger => {
    const emit = (level: LogLevel, message: string, context: LogFields = {}) => {
      if (rank(level) < rank(threshold)) return;
      let entry: LogEntry;
      try {
        const merged = { ...base, ...options.getContext?.(), ...context };
        entry = { timestamp: new Date().toISOString(), level, message: String(message), service: options.service, ...(options.environment ? { environment: options.environment } : {}), context: sanitize(merged, sensitive) as LogFields };
      } catch (error) { report(error); return; }
      for (const transport of transports) {
        try {
          const result = transport.write(entry);
          if (result && typeof (result as Promise<void>).then === "function") {
            const task = Promise.resolve(result).then(() => {}, report);
            pending.add(task);
            void task.finally(() => pending.delete(task));
          }
        } catch (error) { report(error); }
      }
    };
    return {
      trace: (m, c) => emit("trace", m, c), debug: (m, c) => emit("debug", m, c),
      info: (m, c) => emit("info", m, c), warn: (m, c) => emit("warn", m, c),
      error: (m, c) => emit("error", m, c), fatal: (m, c) => emit("fatal", m, c),
      child: context => make({ ...base, ...context }),
      async flush() {
        await Promise.all([...pending]);
        await Promise.all(transports.map(async transport => { try { await transport.flush?.(); } catch (error) { report(error); } }));
      }
    };
  };
  return make(options.context ?? {});
}
