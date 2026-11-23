# Wave 2 — HTTP, caching, resilience

Eight initial packages are implemented in source:

- `@accelerate/http-core`: transport contracts and middleware composition
- `@accelerate/http-client`: fetch-based client with optional timeout
- `@accelerate/http-node`: Node HTTP server adapter
- `@accelerate/http-react`: React context and hook
- `@accelerate/http-angular`: Angular injection provider
- `@accelerate/cache-core`: cache store contract and TTL validation
- `@accelerate/cache-memory`: in-memory TTL cache with injectable clock
- `@accelerate/resilience-core`: retry with backoff and abort support

## Verification

Run `pnpm install --no-frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm registry:sync -- --check`, `pnpm registry:validate`, `pnpm registry:test`, and `pnpm registry:audit` before publishing.

These packages have not been independently verified as published to npm. HTTP adapters are intentionally minimal initial APIs, not production-complete server frameworks. Further hardening should include streaming, request limits, error mapping, retries with idempotency policies, and comprehensive framework integration tests.
