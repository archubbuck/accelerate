# Accelerate package registry

The version-controlled source of truth is `registry/packages.json`. All current workspace packages and future proposals are recorded here.

Run `pnpm registry:validate` to check uniqueness, workspace coverage, paths and dependency cycles. Use `pnpm registry:list`, `pnpm registry:show -- errors-core`, `pnpm registry:roadmap`, `pnpm registry:report`, `pnpm registry:graph` (Graphviz DOT), and `pnpm registry:docs` to generate the catalog.

Lifecycle: proposed → planned → in-progress → implemented → published. Deprecated is a separate terminal state. Publication status is independent; existing packages are marked unknown until npm is verified. The registry never treats source presence as proof of npm publication.

When adding a package, register it in the same change. Proposed entries have null paths. Once implemented, set the path to its workspace directory and update lifecycle. Run validation and regenerate docs. Do not invent release versions.

## Synchronization

Run `pnpm registry:sync` to update versions, internal runtime/peer/optional dependency lists, and implementation paths from workspace package manifests. Run `pnpm registry:sync -- --check` to detect drift without modifying files. CI performs this check.

Run `pnpm registry:sync -- --npm` to additionally query the public npm registry for each implemented package. npm synchronization is intentionally opt-in because it requires network access. A 404 is unpublished, a successful latest dist-tag is published, and failures remain unknown. No package is automatically promoted to a published lifecycle state based on npm alone.

Run `pnpm registry:test` for isolated synchronization tests. The registry never writes back to package.json files.

## Dependency-aware planning and agent discovery

```sh
pnpm registry:next
pnpm registry:next -- 20
pnpm registry:search -- authentication
pnpm registry:readiness
pnpm registry:readiness -- logging-core
pnpm registry:agent-context -- http
```

`registry:next` lists proposed packages with no unfinished prerequisites, ordered by wave, priority and number of direct dependents. `registry:roadmap` shows blockers for all planned packages. `registry:agent-context` outputs structured JSON for agents to inspect before implementing a capability. These commands are read-only.

Readiness is intentionally conservative: the presence of source code does not prove test or documentation completion. Add explicit `testsComplete` and `documentationComplete` flags only after verification. Proposed dependency edges are roadmap prerequisites; synchronization only overwrites dependencies for existing workspace packages.

## Prepublication artifact audit

After building the workspace, run `pnpm registry:audit`. This checks publish manifests, compiled JavaScript and declaration entrypoints, npm access settings, and internal dependency version alignment. Run `pnpm registry:test` to execute the audit's automated tests along with the other registry tests. The audit does not publish packages and does not replace `npm pack --dry-run` or a consumer smoke test.

## Publishing

Both npm release workflows use `node tools/registry/release.mjs` to discover public workspace packages from the registry, order dependencies first, detect generated distribution manifests, verify archives and publish missing versions. Run `node tools/registry/release.mjs plan` after building to preview the release. Existing npm versions are immutable: bump changed package versions and synchronize dependent manifests and registry metadata before release. Only a confirmed npm 404 permits publishing; other lookup errors stop the release. New npm packages may require token bootstrap and trusted publisher configuration before OIDC releases.
