# @accelerate/tooling-ast

Experimental deterministic TypeScript/JavaScript source transformations.

- `parseSource`: compiler AST and syntax diagnostics.
- `findNodes`: predicate-based traversal.
- `applyTextEdits`: validated original spans.
- `transformSource`: syntax checks before and after edits.
- `ensureNamedImport`: conservative, idempotent named value import insertion; rejects identifier collisions.

- `findSymbolReferences`: compiler symbol identity within explicitly supplied virtual files, excluding shadowed bindings. No filesystem or installed dependency resolution; results are not exhaustive.

Cross-file transformations and full semantic validation are not yet implemented.
