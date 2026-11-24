# @accelerate/tooling-ast

Experimental deterministic TypeScript/JavaScript source transformations.

- `parseSource`: compiler AST and syntax diagnostics.
- `findNodes`: predicate-based traversal.
- `applyTextEdits`: validated original spans.
- `transformSource`: syntax checks before and after edits.
- `ensureNamedImport`: conservative, idempotent named value import insertion; rejects identifier collisions.

- `findSymbolReferences`: compiler symbol identity within explicitly supplied virtual files, excluding shadowed bindings. No filesystem or installed dependency resolution; results are not exhaustive.

Cross-file transformations and full semantic validation are not yet implemented.

- `planLocalRename`: preview-only local variable rename; rejects exported declarations, aliases, cross-file references and identifier collisions. Not a general-purpose refactoring engine.

- `rewriteImportModule`: preview static module specifier replacements; does not verify target exports.
- `planUnusedImportRemoval`: conservative single named binding removal, retaining side-effect imports and rejecting potential usages.

- `planSourceTransforms`: preview a batch of explicit source edits, rejecting duplicate targets and invalid syntax before returning any plan. No disk writes or semantic verification.

- `inspectSemanticDiagnostics` and `compareSemanticDiagnostics`: bounded compiler type diagnostics and baseline comparison. No standard libraries, external dependencies or project tsconfig resolution; passing is not proof of full project correctness.
