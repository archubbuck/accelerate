import { Component, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideLogging, injectLogger } from "@accelerate/logging-angular";
import { createMemoryTransport, type LogLevel } from "@accelerate/logging-core";
const memory = createMemoryTransport();
@Component({
  selector: "app-root",
  standalone: true,
  template: `<main style="font-family:system-ui;max-width:900px;margin:3rem auto">
    <h1>Accelerate Logging — Angular</h1>
    <p>Installed from npmjs.org. Generate structured, redacted events.</p>
    @for (level of levels; track level) {
      <button style="margin-right:8px" (click)="emit(level)">{{ level }}</button>
    }
    <pre style="white-space:pre-wrap">{{ output() }}</pre>
  </main>`
})
class App {
  readonly levels: LogLevel[] = ["trace","debug","info","warn","error","fatal"];
  readonly output = signal("");
  private readonly logger = injectLogger("AngularDemo");
  emit(level: LogLevel) {
    this.logger[level]("Angular logging demo event", { level, accessToken: "hidden" });
    this.output.set(memory.entries.map(e => JSON.stringify(e)).join("\n"));
  }
}
bootstrapApplication(App, { providers: [provideLogging({ service: "logging-angular-demo", level: "trace", transports: [memory] })] }).catch(console.error);
