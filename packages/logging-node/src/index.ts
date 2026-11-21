import { AsyncLocalStorage } from "node:async_hooks";
import type { Writable } from "node:stream";
import { createLogger, type LoggerOptions, type LogFields, type LogTransport } from "@accelerate/logging-core";
export { createLogger } from "@accelerate/logging-core";
const storage = new AsyncLocalStorage<LogFields>();
export function runWithLogContext<T>(context: LogFields, callback: () => T): T {
  return storage.run({ ...storage.getStore(), ...context }, callback);
}
export function currentLogContext(): LogFields { return storage.getStore() ?? {}; }
export function createNodeLogger(options: LoggerOptions) {
  return createLogger({ ...options, getContext: () => ({ ...currentLogContext(), ...options.getContext?.() }) });
}
export function createStreamTransport(stream: Pick<Writable, "write">): LogTransport {
  return { write: entry => { stream.write(JSON.stringify(entry) + "\n"); } };
}
