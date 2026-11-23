import { inject, InjectionToken, makeEnvironmentProviders } from "@angular/core";
import type { HttpTransport } from "@accelerate/http-core";
export const ACCELERATE_HTTP_CLIENT = new InjectionToken<HttpTransport>("ACCELERATE_HTTP_CLIENT");
export function provideAccelerateHttp(client: HttpTransport) {
  return makeEnvironmentProviders([{ provide: ACCELERATE_HTTP_CLIENT, useValue: client }]);
}
export function injectHttpClient(): HttpTransport { return inject(ACCELERATE_HTTP_CLIENT); }
