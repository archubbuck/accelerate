# @accelerate/tooling-ast

Experimental deterministic TypeScript/JavaScript source transformations.

- `parseSource`: compiler AST and syntax diagnostics.
- `findNodes`: predicate-based traversal.
- `applyTextEdits`: validated original spans.
- `transformSource`: syntax checks before and after edits.
- `ensureNamedImport`: conservative, idempotent named value import insertion; rejects identifier collisions.

Semantic symbol resolution and cross-file transformations are not yet implemented.
