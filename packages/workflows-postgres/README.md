# @accelerate/workflows-postgres

Apply the exported `workflowMigration` with the migrations runner, then pass `createPostgresWorkflowStore(db)` to `DurableWorkflowRunner`. All workers must use the same schema and versioned definitions. Activity execution happens outside database transactions. A short row lock serializes each claim, checkpoint or control decision, and the same transaction appends its history. Lease decisions use database time after acquiring the lock. Crashed workers can be replaced using the persisted instance ID.

Configure a trusted search path, a dedicated migration role, and least-privilege worker access to the two tables and history identity sequence. Restrict reads of persisted workflow inputs and outputs. The store retains completed instances and history until the application archives them. See workflows-core for delivery, idempotency, cancellation and compensation semantics.
