# OAuth and OpenID Connect

Install the consolidated identity package with the optional OpenID Connect client dependency.

```sh
npm install @accelerate/identity openid-client@^6.9.1
```

Use `createOAuthClient` from `@accelerate/identity/authentication/oauth` for delegated API access. Use `createOidcClient` from `@accelerate/identity/authentication/oidc` for sign-in. Keep access tokens, ID tokens, authorization codes, and the client secret on the server.

## Google and Microsoft sign-in

Register one exact HTTPS callback per provider. Use the Google issuer `https://accounts.google.com`. For Microsoft Entra ID use the configured tenant-specific issuer `https://login.microsoftonline.com/<tenant-id>/v2.0` and register a Web callback. Enable authorization code flow and configure confidential client credentials through your secret manager.

```ts
import { createOidcClient } from '@accelerate/identity/authentication/oidc';
import { createSession, digestSessionToken } from '@accelerate/identity/authentication/node';
import {
  createPostgresAuthorizationTransactionStore,
  createPostgresExternalIdentityLinks,
} from '@accelerate/identity/authentication/postgres/external';

const transactions = createPostgresAuthorizationTransactionStore(db);
const links = createPostgresExternalIdentityLinks(db);

async function signInProvider(issuer: string, clientId: string, secret: string, callback: string) {
  return createOidcClient({
    issuer: new URL(issuer),
    clientId,
    clientMetadata: secret,
    redirectUri: new URL(callback),
    scopes: ['profile', 'email'],
    transactions,
    identities: {
      async resolveIdentity({ issuer, subject }) {
        const id = await links.find(issuer, subject);
        if (!id) throw new Error('External identity must be provisioned or explicitly linked');
        return id;
      },
    },
  });
}

const google = await signInProvider(
  'https://accounts.google.com',
  googleClientId, googleClientSecret, 'https://app.example/auth/google/callback',
);
const microsoft = await signInProvider(
  `https://login.microsoftonline.com/${tenantId}/v2.0`,
  microsoftClientId, microsoftClientSecret, 'https://app.example/auth/microsoft/callback',
);
```

Generate a fresh high-entropy browser binding with `issueSessionToken().token` or an equivalent cryptographic random generator. Store it in a short-lived `Secure`, `HttpOnly`, `SameSite=Lax` cookie for the authorization callback. Set the cookie before redirecting to `await google.begin(binding)`. At the callback, read the binding from that cookie and construct the full callback URL from your configured application origin and the incoming path/query. Do not derive the expected origin from an untrusted Host or forwarded header. Clear the binding cookie when the flow finishes.

```ts
const { identityId } = await google.complete(callbackUrl, bindingCookie);
const { token } = await createSession({ store: sessions, identityId, ttlMs: 8 * 60 * 60 * 1000 });
// Set token in a Secure, HttpOnly session cookie with an appropriate SameSite policy.

// At logout, revoke the local session and expire the session cookie.
await sessions.revoke(digestSessionToken(sessionCookie));
```

If you use provider logout, keep the ID token server-side and call `logoutUrl(idToken)` after revoking the local session. Supply a fixed, provider-registered logout callback when configuring the client. Do not log that URL because it may contain an ID token.

Apply `externalIdentitySchema` through your application migration runner after creating `accelerate_identities`. Run `transactions.pruneExpired(Date.now())` periodically. The PostgreSQL store uses a single delete-and-return statement for one-time callback consumption. The in-memory transaction store is available for development and single-process tests.

Resolve returning users by validated issuer and subject. Provision or link identities only through a flow that verifies the user's authority to create or link the local account. An email match alone cannot establish that authority. `links.link` refuses to overwrite a link already held by another identity.
