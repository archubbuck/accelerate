# @accelerate/tooling-project

Read-only root project inspection, framework detection and Accelerate dependency inventory. Workspace traversal and lockfile resolution are not yet supported.

`discoverPackages(root, {maxDepth, maxDirectories})` discovers candidate package boundaries with bounded traversal. It excludes hidden directories, dependencies and common build outputs. Candidate discovery does not establish declared workspace membership.

`inspectWorkspace` supports literal and single-segment wildcard package.json workspace declarations; simple pnpm YAML package lists are supported; complex YAML and globs are explicitly unsupported. `inspectDependencyGraph` reports declared internal dependency edges for explicit package paths, not resolved versions.

`orderDependencies` returns dependency-first ordering and cycle-blocked nodes. Defaults to runtime and optional dependency edges; callers can select other sections.

`inspectDependencyImpact(graph, target)` reports transitive dependencies and dependents with shortest graph distances. All declared dependency sections are included by default; cycles are traversed without repeating nodes.

`classifyPackage(root)` reports candidate library, CLI and application roles with manifest evidence. Roles may overlap and are not verified runtime behavior.

`inspectSourceLayout(root)` reports conventional source directories and strict JSON TypeScript configuration evidence. JSONC, inherited settings, glob expansion and effective compiler configuration are not resolved.

`discoverSourceFiles` enumerates candidate JS/TS source files in explicit relative roots, with file and directory limits. It does not expand TypeScript compiler include/exclude patterns.
