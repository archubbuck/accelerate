# Reproducible experiments

Use `@accelerate/data/experiments` for deterministic weighted assignment and `@accelerate/data/experiments/postgres` for persistence. Apply `experimentSchema` after `provenanceSchema`.

Define an immutable experiment version with a seed, ordered control and treatment arms, explicit code and configuration versions, and references to registered dataset artifacts. Each arm carries an independent parameter set. Each run pins one specification version, so editing a later version cannot change prior assignments. Use stable, pseudonymous subject identifiers.

Call `start` with a run ID, `assign` to select an arm, and `observe` with a declared metric and a stable observation ID. Retrying an identical observation is idempotent. A changed observation with the same ID fails. End the run with `finish` when completed, failed, or cancelled. Terminal runs retain prior results and reject additional observations.

`compare` reports sample count, mean, and difference from control for a declared metric. These are descriptive statistics. Apply your application's sampling and significance criteria before drawing conclusions. Use `inspect` to retrieve the pinned configuration and query the original dataset lineage from the provenance store.
