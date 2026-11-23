# @accelerate/authentication-node

Node.js session token issuance. Tokens are 256-bit cryptographically random opaque bearer credentials; only SHA-256 digests are stored in session records.

```ts
import { createSession, digestSessionToken } from "@accelerate/authentication-node";
const { token } = await createSession({ store: sessionStore, identityId: user.id, ttlMs: 3600000 });
// Deliver token via a Secure, HttpOnly, SameSite cookie over HTTPS.
const sessionId = digestSessionToken(token);
```

Protect issuance with application-specific credential verification and rate limiting. Do not put bearer tokens in logs or URLs.
