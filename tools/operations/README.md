# Agent Operations (experimental)
Run from the Accelerate checkout using Node.js. This is not yet an installed npm CLI.

```sh
node tools/operations/cli.mjs list
node tools/operations/cli.mjs describe feature-flags.register
node tools/operations/cli.mjs execute request.json --root /path/to/consumer > plan.json
node tools/operations/cli.mjs apply-plan plan.json --apply --root /path/to/consumer
```

Example request:
```json
{"schemaVersion":"1.0","operation":"feature-flags.register","operationVersion":"1.0.0","input":{"target":"flags.json","key":"dashboard.redesign","enabled":false}}
```

The target must be an existing UTF-8 JSON array of flag definitions already consumed by the application's FlagStore. Preview does not modify files. Apply reproduces the reviewed plan and checks hashes. A successful patch does not prove runtime wiring. Do not run concurrent editors during apply. The cooperative lock is not a security sandbox or crash recovery mechanism. Never use feature flags as authorization.

Run `pnpm registry:test` for operation tests. Current limitations: repository-local discovery, restricted schema validation, existing file replacements only, no AST integration, no installed-package discovery, no MCP.
