# Tenant-scoped search and retrieval

Use `@accelerate/data/search` for the index contract, `@accelerate/data/search/memory` for tests, and `@accelerate/data/search/postgres` for PostgreSQL. Apply `searchSchema` through the application's migration runner.

Index passages with a tenant ID, title, normalized text, tags and an artifact version and passage range from document ingestion. Mark each passage tenant-readable or restricted to an explicit list of user or role IDs. Derive the search access context from authenticated tenant membership and current authorization claims. Only call index mutations from authorized indexing jobs.

```ts
const index = createPostgresSearchIndex(db);
const page = await index.search(
  { tenantId: membership.tenantId, principals: authenticatedAudience },
  { text: 'reservoir condition', tags: ['field-report'], limit: 20 },
);
```

Both adapters filter by tenant, audience and tags. PostgreSQL uses indexed full-text matching for lexical search. Supply normalized or unnormalized embeddings from a configured provider to add cosine similarity or use vector-only search. Use one embedding model and dimension per index, and reindex if changing the model. PostgreSQL vector search uses native arrays and scans authorized candidates, so reserve it for bounded indexes or implement an indexed vector adapter behind the same contract.

Pass the returned cursor back with the same search and access context. Ranking data can change if the index changes between pages. Delete passages when the original document is withdrawn. Search hits carry artifact versions and offsets for source traceability.
