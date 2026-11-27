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

## Trusted publisher migration

Use npm CLI 11.15.0 or later and interactive npm authentication with package administration rights. Run locally; no admin token is stored in the repository.

1. Bootstrap missing packages with the existing token workflow.
2. Prepare unpublished release versions before trust provisioning; npm versions cannot be overwritten.
3. Run `pnpm registry:trust:plan` to inspect current relationships. Optional package IDs restrict a run.
4. Run `pnpm registry:trust:configure --confirm` to create relationships only where npm explicitly returns an empty list. Existing relationships and unfamiliar response shapes require review; nothing is deleted or replaced. Results are JSON, and creation attempts are spaced apart. Interactive npm authentication may be required.
5. Inspect `pnpm registry:trust:audit` output for repository archubbuck/accelerate, workflow publish.yml and publish permission. Run the OIDC release promptly after configuration.
6. Run `pnpm registry:trust:verify` to retrieve release attestation metadata and inspect it alongside npm trusted publisher verification status. Presence of attestations alone does not prove the expected publisher was verified.
7. Once all relationships and releases are verified, restrict token publishing and revoke the bootstrap token when no longer needed. Keep bootstrap available for future new packages.

The trust commands intentionally report existing records for operator review instead of guessing undocumented npm response schemas. See https://docs.npmjs.com/cli/commands/npm-trust/ and https://docs.npmjs.com/trusted-publishers/.

## Consolidated npm packages

`registry/consolidation.json` assigns every existing package to one of 14 canonical families. The build preserves public subpaths, compiled Angular entry points, the scaffolding CLI, presets, and packaged agent operations. The SDK catalog includes a complete import-to-import map. Regenerate manifests and documentation with `node tools/registry/consolidation.mjs manifests` and `node tools/registry/consolidation.mjs docs`, then sync the package registry.

CI installs the 14 archives in a clean project and checks their exports. The release workflows expose a Preview input to publish the prereleases under the `next` tag. Verify npm access and trusted publisher configuration before dispatching. The preview uses a shared version across the families so cross-package imports resolve to the same release. Verify published installs and migration paths before promoting a stable version. Existing versions remain installable during the migration window.
