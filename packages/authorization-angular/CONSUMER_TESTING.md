# Consumer-level Angular smoke test

The `consumer-smoke.mjs` script generates a temporary standalone Angular application using the workspace's Angular CLI, installs the locally built `dist` package, imports `provideAuthorization` and `AuthCanDirective`, and runs a production application build. This exercises Angular's linker against the partial-Ivy package in an actual consuming app.

Run from the repository root:

```sh
pnpm install
pnpm --filter @accelerate/authorization-angular build
pnpm --filter @accelerate/authorization-angular test:consumer
```

The script creates a temporary directory and removes it afterward. It uses npm to resolve the fixture's Angular dependencies; CI needs registry access. This is a compilation smoke test, not a browser-based runtime or multi-version compatibility test.
