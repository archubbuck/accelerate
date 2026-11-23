# @accelerate/api-keys

Node.js opaque API key issuance, SHA-256 hashing, verification, expiration and revocation. Returns the plaintext token only at issuance; persist the record, not the token.

```ts
import { issueApiKey, verifyApiKey } from "@accelerate/api-keys";
const { token, record } = issueApiKey("service-123");
await store.put(record);
const authenticated = await verifyApiKey(token, store);
```

The included memory store is for testing and single-process use. Production requires a durable store, rate limiting, audit trails and secure key delivery. Rotate by issuing a replacement and revoking the old key.
