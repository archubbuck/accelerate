# @accelerate/testing-postgres

Run fixtures and tests on a dedicated PostgreSQL connection inside a rollback-only transaction. Do not commit, roll back or release the connection inside the callback. No database provisioning is performed.

## Usage

```ts
await withRollback(client, async tx => { await applyFixtures(tx, [{ sql: 'INSERT INTO test VALUES ($1)', parameters: [1] }]); });
```
