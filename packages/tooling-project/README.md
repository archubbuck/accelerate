# @accelerate/tooling-project

Read-only root project inspection, framework detection and Accelerate dependency inventory. Workspace traversal and lockfile resolution are not yet supported.

`discoverPackages(root, {maxDepth, maxDirectories})` discovers candidate package boundaries with bounded traversal. It excludes hidden directories, dependencies and common build outputs. Candidate discovery does not establish declared workspace membership.
