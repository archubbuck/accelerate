# Accelerate agent instructions

Before implementing or changing packages, inspect the repository guidance and registry:

1. Read `README.md`, `registry/README.md`, and `registry/packages.json`.
2. Run `pnpm registry:agent-context -- <capability>` and `pnpm registry:search -- <capability>` to find existing or proposed packages.
3. Inspect applicable packages and their actual public APIs before introducing new abstractions. Prefer extending a compatible existing package over duplicating functionality.
4. Run `pnpm registry:roadmap` to review dependencies and prerequisites. A proposed entry is not a working implementation.
5. Keep core contracts framework-agnostic. Keep framework and infrastructure integrations in adapter packages. Do not introduce dependency cycles.
6. When adding or changing a package, update `registry/packages.json`, run `pnpm registry:sync`, `pnpm registry:validate`, and `pnpm registry:docs`.
7. Run `pnpm registry:test`, relevant package tests, typechecking, and builds. Do not claim checks passed without running them.
8. Never infer npm publication from source presence. Use `pnpm registry:sync -- --npm` to query actual publication status when needed; inspect failures rather than claiming a package is unpublished.
9. Include README documentation, tests, and accurate registry metadata with package changes. Do not mark tests or documentation complete without verification.

Registry metadata and roadmap priorities are planning aids; implementation and publication remain separate facts.
