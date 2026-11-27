# Accelerate Angular

Angular bindings for Accelerate.

Install with `npm install @accelerate/angular`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

Use Angular 19 or 20 with matching core and common versions, plus RxJS 7.4 or newer within version 7. Authorization and logging retain their compiled Angular entry points.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Replacement import |
| --- | --- |
| `@accelerate/authentication-angular` | `@accelerate/angular/authentication` |
| `@accelerate/authorization-angular` | `@accelerate/angular/authorization` |
| `@accelerate/config-angular` | `@accelerate/angular/config` |
| `@accelerate/forms-angular` | `@accelerate/angular/forms` |
| `@accelerate/http-angular` | `@accelerate/angular/http` |
| `@accelerate/logging-angular` | `@accelerate/angular/logging` |
| `@accelerate/state-angular` | `@accelerate/angular/state` |
| `@accelerate/tables-angular` | `@accelerate/angular/tables` |
