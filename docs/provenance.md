# Data and AI output provenance

Compute a SHA-256 digest over the original bytes with `artifactSha256` from `@accelerate/data/provenance`. Apply `provenanceSchema` and construct a scoped store with `createPostgresProvenanceStore` from `@accelerate/data/provenance/postgres`.

Record retrieved sources by artifact ID and immutable version. Store their retrieval time as a UTC ISO timestamp, and keep the actual content in storage with access controls appropriate to the application. Use a distinct new version when bytes or independently tracked source metadata change.

Record transformations with a version, optional model, prompt and tool versions, input evidence, and new output artifacts. Evidence can cite an existing artifact version and a half-open passage range. Choose the offset unit for a document format and keep it stable. Use explicit missing evidence when a source cannot be recovered. For ingestion or workflow checkpoints, call the store's `bind(transaction)` method to commit provenance together with application state.

`lineage` returns the upstream DAG, including each transformation and missing-evidence records. Check the truncation indicator when exporting. Scopes isolate access between datasets in the storage model. Enforce authorization before deriving a scope or returning any lineage. Review marks the current artifact status and reviewer. Redaction removes identifying artifact metadata and review details while keeping the digest and lineage references. Keep sensitive content out of transformation identifiers and missing-evidence descriptions, and apply separate retention to the underlying files.
