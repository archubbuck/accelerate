# @accelerate/authorization-angular

Angular standalone integration for the Accelerate authorization library.

## Installation

```sh
npm install @accelerate/authorization-angular
```

Angular 19+ is required for this package's Angular partial-compilation output. Angular and RxJS are peer dependencies. For endpoint-backed loading, configure `provideHttpClient()` in your application.

```ts
import { provideHttpClient } from "@angular/common/http";
import { provideAuthorization } from "@accelerate/authorization-angular";

export const providers = [
  provideHttpClient(),
  provideAuthorization({ endpoint: "/api/authorization/me" })
];
```

Load the authorization snapshot with `AuthorizationService.refresh()` after login; call `reset()` at logout. Templates can use the standalone `AuthCanDirective`:

```html
<button *authCan="'documents.edit'">Edit</button>
```

Import `AuthCanDirective` in the consuming standalone component. This directive controls visibility only; **the backend must enforce every permission**.

## Publishing

The Angular package uses `ng-packagr` and Angular partial compilation. Run `pnpm --filter @accelerate/authorization-angular build` and publish **from `packages/authorization-angular/dist`**, not from the source package directory. The built directory contains the generated Angular Package Format package metadata, declarations, and flattened ESM bundle. Do not publish the raw `tsc` output.
