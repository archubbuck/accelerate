# Accelerate Tooling

Scaffolding, agent operations, AST tools and developer presets.

Once published, install with `npm install @accelerate/tooling@next`. See the [Accelerate SDK catalog](https://www.npmjs.com/package/@accelerate/sdk) for the other packages.

Run `npx --package @accelerate/tooling@next create-accelerate --help` to use the existing scaffolding CLI. The CLI still accepts existing catalog IDs.

## Import migration

Use the subpaths below. Update related imports together wherever your app shares class or provider identity.

| Existing import | Preview import |
| --- | --- |
| `@accelerate/create-accelerate` | `@accelerate/tooling/create` |
| `@accelerate/eslint-config` | `@accelerate/tooling/eslint` |
| `@accelerate/tooling-ast` | `@accelerate/tooling/ast` |
| `@accelerate/tooling-core` | `@accelerate/tooling/core` |
| `@accelerate/tooling-patches` | `@accelerate/tooling/patches` |
| `@accelerate/tooling-project` | `@accelerate/tooling/project` |
| `@accelerate/tooling-registry` | `@accelerate/tooling/registry` |
| `@accelerate/typescript-config/base.json` | `@accelerate/tooling/tsconfig/base.json` |
| `@accelerate/typescript-config/library.json` | `@accelerate/tooling/tsconfig/library.json` |
