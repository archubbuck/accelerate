# Time-series observations

Use `@accelerate/data/time-series` for observation contracts, resampling, aggregation and rolling means. Apply `timeSeriesSchema` and use `createPostgresTimeSeriesStore` from `@accelerate/data/time-series/postgres` for persistence.

Observations are keyed by series and integer epoch millisecond. A null value marks a missing measurement. Metadata should be JSON-compatible. For ingestion, choose a duplicate policy of reject, ignore, or replace. You can also reject timestamps older than the series high-water mark. The adapter commits or rolls back each batch atomically.

```ts
await store.ingest('temperature', [{ at: Date.now(), value: 21.4 }], {
  duplicates: 'ignore', outOfOrder: 'allow',
});
const page = await store.range('temperature', { start, end, after: cursor, limit: 200 });
const summaries = resampleObservations(page, { start, end }, 60000, 'skip');
```

Range starts are inclusive, ends are exclusive, and `after` is exclusive. Read the complete intended range across pages before aggregating it. Rolling windows are open at their lower timestamp and include the current observation. Missing samples can be skipped, treated as zero, or propagated through statistics. Empty resampling buckets are represented as one missing observation.

PostgreSQL stores observations in a range-partitioned table. The default partition handles dates outside explicit ranges. Manage range partitions through application migrations. Use `prune` in bounded batches for retention. Retention preserves the ingestion high-water mark.
