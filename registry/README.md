# Accelerate package registry

The version-controlled source of truth is `registry/packages.json`. All current workspace packages and future proposals are recorded here.

Run `pnpm registry:validate` to check uniqueness, workspace coverage, paths and dependency cycles. Use `pnpm registry:list`, `pnpm registry:show -- errors-core`, `pnpm registry:roadmap`, `pnpm registry:report`, `pnpm registry:graph` (Graphviz DOT), and `pnpm registry:docs` to generate the catalog.

Lifecycle: proposed → planned → in-progress → implemented → published. Deprecated is a separate terminal state. Publication status is independent; existing packages are marked unknown until npm is verified. The registry never treats source presence as proof of npm publication.

When adding a package, register it in the same change. Proposed entries have null paths. Once implemented, set the path to its workspace directory and update lifecycle. Run validation and regenerate docs. Do not invent release versions.
