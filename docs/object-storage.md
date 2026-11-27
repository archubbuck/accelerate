# Provider-neutral object storage

Use `@accelerate/data/storage` for the contracts and `@accelerate/data/storage/memory` for bounded storage in tests. Use `@accelerate/data/storage/s3` in Node with the AWS SDK S3 client and presigner peers. Configure the S3 client and credentials outside the adapter.

```ts
const store = createS3ObjectStore({
  client: s3, bucket: 'documents', namespace: 'tenant-123', maxObjectBytes: 10 * 1024 * 1024,
});
await store.put({ key: 'reports/source.txt', body, size, contentType: 'text/plain', sha256 });
const result = await store.get('reports/source.txt', { verifySha256: sha256 });
```

Pass a known byte length for streaming uploads. The adapter checks byte counts as the body flows. If supplied, the SHA-256 digest is sent to the provider for upload verification. Download verification emits a stream error on mismatch at the end of the stream. Fully consume and verify the stream before committing changes that require verified content.

The namespace prefixes every provider request. Derive it from authorized server-side context and restrict the S3 credentials to the same bucket and prefix. The adapter rejects traversal segments. It supports metadata, head requests, idempotent deletion, and cursor pagination. Only grant a signed download URL after checking authorization. Treat it as a short-lived bearer credential and keep it out of logs.

For an S3-compatible endpoint, configure the client endpoint and addressing style as required by the provider. Verify its checksum API support if uploads supply a SHA-256 digest.
