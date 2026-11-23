# @accelerate/authentication-core

Framework-neutral identity and session contracts, expiry validation, session revocation, and a deterministic in-memory session store. Authentication does not grant authorization permissions.

```ts
import { createAuthenticator, MemorySessionStore } from "@accelerate/authentication-core";
const sessions = new MemorySessionStore();
const auth = createAuthenticator({ sessions, identities: myIdentityStore });
const context = await auth.authenticate(sessionId);
```

Session identifiers are credentials. Generate them with a cryptographically secure random source, transport over HTTPS, and never log them. The memory store is for tests and single-process use only.
