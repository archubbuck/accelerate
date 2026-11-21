import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import type { Logger, LogFields } from "@accelerate/logging-core";
const Context = createContext<Logger | null>(null);
export function LoggingProvider({ logger, children }: { logger: Logger; children: ReactNode }) {
  return createElement(Context.Provider, { value: logger }, children);
}
export function useLogger(component?: string, context?: LogFields): Logger {
  const logger = useContext(Context);
  if (!logger) throw new Error("useLogger requires LoggingProvider");
  // Pass stable context values to avoid rebuilding child loggers on every render.
  const serialized = JSON.stringify(context ?? {});
  return useMemo(() => component || context ? logger.child({ ...(component ? { component } : {}), ...context }) : logger, [logger, component, serialized]);
}
