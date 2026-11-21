import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient } from "@angular/common/http";
import { provideAuthorization } from "@accelerate/authorization-angular";
import { AppComponent } from "./app.component";
bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(), provideAuthorization({ endpoint: "/api/authorization/me" })]
}).catch(console.error);
