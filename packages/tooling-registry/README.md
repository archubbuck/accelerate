# @accelerate/tooling-registry

Experimental package-owned operation metadata validation. Schema 1.0 documents declare package, packageVersion and operations entries containing manifest, handler (relative .mjs path), and exportName. Validation checks identity, ownership, duplicate operation versions and core operation contracts. It does not load handlers or establish trust.
