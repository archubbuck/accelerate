import { ErrorHandler, InjectionToken, inject, makeEnvironmentProviders, type EnvironmentProviders } from "@angular/core";
import { createLogger, type Logger, type LoggerOptions } from "@accelerate/logging-core";
export const ACCELERATE_LOGGER = new InjectionToken<Logger>("ACCELERATE_LOGGER");
export function provideLogging(options: LoggerOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ACCELERATE_LOGGER, useFactory: () => createLogger(options) }]);
}
export function injectLogger(component?: string): Logger {
  const logger = inject(ACCELERATE_LOGGER);
  return component ? logger.child({ component }) : logger;
}
export class LoggingErrorHandler implements ErrorHandler {
  private readonly logger = inject(ACCELERATE_LOGGER);
  handleError(error: unknown): void { this.logger.error("Unhandled Angular error", { error }); }
}
