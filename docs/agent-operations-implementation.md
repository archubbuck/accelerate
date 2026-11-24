# Agent Operations — implementation backlog

Single delivery phase; workstreams are dependency ordered, not approval gates.
Status: in-progress. Runtime package baseline: 85 registry entries marked implemented; publication is independent.

## Discovery findings
- Existing registry CLI already supports search, readiness, dependency ordering and agent context. Extend it rather than duplicate it.
- Workspace uses pnpm and TypeScript; package changes require registry synchronization, docs, tests and artifact audit.
- FeatureFlags exposes asynchronous enabled(key, context, fallback) over a FlagStore; FeatureFlag has key, enabled and optional rules. There is no universal application registration file or framework adapter in the core API.
- Feature flags are not authorization controls. Provider and consumer conventions must be inspected before implementing transformations.

## Workstreams
| ID | Work | Dependencies | Status |
|---|---|---|---|
| 01 | Repository discovery and baseline | none | in-progress |
| 02 | Versioned contracts and manifests | 01 | planned |
| 03 | Execution engine | 02 | planned |
| 04 | Registry intelligence | 02 | planned |
| 05 | Consumer inspection | 02 | planned |
| 06 | AST transformations | 05 | planned |
| 07 | Safe patch management | 03,05 | planned |
| 08 | Package-owned operation framework | 02,03,04 | planned |
| 09 | Feature flag reference | 06,07,08 | planned |
| 10 | All package operation coverage | 09 | planned |
| 11 | Composition | 03,07,09 | planned |
| 12 | Knowledge and maintenance | 04,05 | planned |
| 13 | CLI | 03,08 | planned |
| 14 | MCP and onboarding | 13 | planned |
| 15 | Security, tests and benchmarks | 02–14 | planned |
| 16 | Governance and release | 10–15 | planned |

## Acceptance
Each operation must have versioned input/output contracts, explicit ownership, compatibility, fixtures and evidence. Mutation defaults to preview; reject ambiguous targets, stale hashes and paths outside the project. Do not execute project code during inspection. Keep tooling out of runtime dependencies. Verify idempotency and recovery. Never mark unsupported or untested operations implemented.

Final acceptance: packaged consumer application, composed feature flag/authorization/audit/metrics integration, verification and flag retirement without reading runtime package source.

## Verification
Repository guidance and selected manifests/source inspected via GitHub. Full source inventory and executable baseline checks remain outstanding.
