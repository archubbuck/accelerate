# @accelerate/tooling-registry

Experimental package-owned operation metadata validation. Schema 1.0 documents declare package, packageVersion and operations entries containing manifest, handler (relative .mjs path), and exportName. Validation checks identity, ownership, duplicate operation versions and core operation contracts. It does not load handlers or establish trust.

Use `discoverPackageOperations(root, names)` to inspect explicit installed package names. It follows package-manager directory links but rejects linked manifest files and nested manifest path links. `indexOperations(packages)` excludes ambiguous operation/version identities; `searchOperations(index, filters)` searches identifiers, descriptions, owners and modes. Discovery is not a trust decision and does not load handlers.

`resolveOperation(index, request)` requires exact operation and installed package versions. It returns resolved, conflict, not-found or incompatible; semver ranges and runtime compatibility are not inferred.
