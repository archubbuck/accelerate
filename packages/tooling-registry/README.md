# @accelerate/tooling-registry

Experimental package-owned operation metadata validation. Schema 1.0 documents declare package, packageVersion and operations entries containing manifest, handler (relative .mjs path), and exportName. Validation checks identity, ownership, duplicate operation versions and core operation contracts. It does not load handlers or establish trust.

Use `discoverPackageOperations(root, names)` to inspect explicit installed package names. It follows package-manager directory links but rejects linked manifest files and nested manifest path links. `indexOperations(packages)` excludes ambiguous operation/version identities; `searchOperations(index, filters)` searches identifiers, descriptions, owners and modes. Discovery is not a trust decision and does not load handlers.

`resolveOperation(index, request)` requires exact operation and installed package versions. It returns resolved, conflict, not-found or incompatible; semver ranges and runtime compatibility are not inferred.

`inspectHandlerIntegrity(root, request)` resolves metadata and hashes a bounded regular handler file without importing it. `authorizeHandler(evidence, approval)` checks explicit caller approval of the exact identity, handler path, export and digest. Approval must originate from a trusted caller, not the discovered package. This is not a signature, sandbox, dependency integrity check, or protection against changes between inspection and import. The loader described below is limited to trusted standalone modules.

`loadApprovedHandler(root, request, approval)` imports digest-verified standalone ESM bytes via a data URL after explicit approval. Relative and bare package imports are not supported by this loading mechanism. Absolute and built-in imports may still execute; no dependency integrity or sandbox guarantee is provided. Node may cache identical module bytes across operations. Use only trusted handlers with caller-controlled approvals.

`executeApprovedOperation(root, request, approval)` validates discovered metadata, checks explicit approval, loads the standalone handler and executes it through tooling-core. Installed apply requests are blocked. This is trusted in-process execution, not isolation; handlers must not mutate the project directly. The outer result distinguishes blocked loading from an executed core response.
