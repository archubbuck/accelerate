# Document ingestion

Use `@accelerate/data/document-ingestion` for source and extractor contracts and the UTF-8 plain-text extractor. Use `@accelerate/data/document-ingestion/postgres` for persistence. Apply `documentIngestionSchema` after `provenanceSchema`.

Provide a trusted source adapter that opens a byte stream with a known size and reports the source version, content type, retrieval time and optional modification time. Use a custom extractor for other formats. Choose extractors in application code, and isolate untrusted file formats before running parser code.

```ts
const documents = createPostgresDocumentStore(db, tenantScope);
const ingest = createDocumentIngestion({ objects, documents, maxSourceBytes: 2 * 1024 * 1024 });
const record = await ingest(sourceAdapter, plainTextExtractor, signal);
```

The pipeline bounds source bytes and extracted text, normalizes Unicode and newlines, and emits stable UTF-16 passage offsets into the normalized text. Raw bytes are stored by content hash. The PostgreSQL adapter commits the document and provenance references together and checks the pinned source version when concurrent workers ingest it.

Use stable source and extractor versions as the workflow retry boundary. Completed results are reused. Bump the source version when bytes change and the extractor version when normalization or extraction behavior changes. A failed extraction yields a typed error before metadata is committed. A crash between object storage and the database commit can leave an unreferenced content-addressed object. Reuse it on retry and apply retention according to the application's storage policy.
