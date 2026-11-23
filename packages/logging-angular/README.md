# @accelerate/logging-angular

Angular dependency-injection integration for `@accelerate/logging-core`, with a logger provider, an injection helper, and an optional application error handler.

## Install

```sh
npm install @accelerate/logging-angular @accelerate/logging-core
```

Supports Angular 19 and 20.

## Quick start

```ts
// app.config.ts
import { ApplicationConfig, ErrorHandler } from "@angular/core";
import { LoggingErrorHandler, provideLogging } from "@accelerate/logging-angular";

export const appConfig: ApplicationConfig = {
  providers: [
    provideLogging({ service: "angular-app", level: "info" }),
    { provide: ErrorHandler, useClass: LoggingErrorHandler }
  ]
};
```

```ts
// dashboard.component.ts
import { Component } from "@angular/core";
import { injectLogger } from "@accelerate/logging-angular";

@Component({
  selector: "app-dashboard",
  standalone: true,
  template: `<button (click)="refresh()">Refresh</button>`
})
export class DashboardComponent {
  private readonly logger = injectLogger("DashboardComponent");

  refresh() {
    this.logger.info("Dashboard refresh requested");
  }
}
```

## API

- `provideLogging(options)` registers an `ACCELERATE_LOGGER` provider using the core logger options.
- `injectLogger(component?)` injects the configured logger; with a component name it returns a child logger with a `component` field.
- `ACCELERATE_LOGGER` is the Angular injection token for the core `Logger` interface.
- `LoggingErrorHandler` implements Angular's `ErrorHandler` and logs uncaught Angular errors with the message `Unhandled Angular error`.

Register `LoggingErrorHandler` explicitly only if you want it to replace the default Angular error handler. Call `injectLogger` within an Angular injection context, such as a field initializer or constructor. The provider is application-scoped when registered at bootstrap.

[Source and issues](https://github.com/archubbuck/accelerate)
