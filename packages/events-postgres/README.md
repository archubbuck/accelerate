# @accelerate/events-postgres

Adapter for events postgres. Install `@accelerate/events-postgres` and its declared peer dependencies. The consuming application owns infrastructure setup and lifecycle.

Execute the exported schema SQL in a controlled migration before using the adapter. Database connections are supplied by the caller.

Use `createPostgresEventJournal(db)` after applying `eventJournalMigration` with the migrations runner in one transaction. The migration takes an exclusive lock on the existing event table, backfills cursors in occurrence-time and ID order, and defaults historical schema versions to 1. Schedule it when the table can be locked. The original append/list API and historical rows remain usable.

A trigger on every insert, including legacy writes, takes a transactional lock on the sequence row. This serializes appends until commit so a checkpoint cannot pass an invisible event. Keep writer transactions short. Duplicate IDs can leave cursor gaps. Checkpoints, leases and dead letters persist across client and process restarts. Lease deadlines use database time.

Use a trusted schema search path and separate migration role. Writers need INSERT on the event table plus SELECT and UPDATE on the sequence row. Readers need SELECT on the event table. Workers additionally need SELECT, INSERT and UPDATE on the subscriptions table. Restrict table deletes and updates to preserve replay history. See events-core for ack, nack and redrive behavior.
