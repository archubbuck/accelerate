import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  enableNonRepudiationChecks,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type ClientAuth,
  type ClientMetadata,
} from "openid-client";

export interface AuthorizationTransaction {
  verifier: string;
  nonce?: string;
  expiresAt: number;
}

/** consume must atomically remove a matching, unexpired transaction. */
export interface AuthorizationTransactionStore {
  put(key: string, transaction: AuthorizationTransaction): Promise<void>;
  consume(key: string, now: number): Promise<AuthorizationTransaction | undefined>;
}

export interface AuthorizationCodeOptions {
  issuer: URL;
  clientId: string;
  clientMetadata?: Partial<ClientMetadata> | string;
  clientAuthentication?: ClientAuth;
  redirectUri: URL;
  scopes: readonly string[];
  transactions: AuthorizationTransactionStore;
  transactionTtlMs?: number;
  now?: () => number;
}

export class ExternalAuthorizationError extends Error {
  constructor(readonly code: "INVALID_CALLBACK" | "INVALID_TRANSACTION" | "PROVIDER_REJECTED") {
    super("External authorization could not be completed");
    this.name = "ExternalAuthorizationError";
  }
}

async function transactionKey(issuer: string, client: string, state: string, binding: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([issuer, client, state, binding]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function validBinding(binding: string) {
  return /^[A-Za-z0-9_-]{32,256}$/.test(binding);
}

function secureUrl(url: URL) {
  return url.protocol === "https:" && !url.username && !url.password && !url.hash;
}

export async function createAuthorizationFlow(options: AuthorizationCodeOptions, oidc: boolean) {
  const issuer = new URL(options.issuer);
  const redirect = new URL(options.redirectUri);
  if (!secureUrl(issuer) || issuer.search || !secureUrl(redirect) || redirect.search || !options.clientId) {
    throw new TypeError("Configure a fixed HTTPS issuer and callback URL");
  }
  const ttl = options.transactionTtlMs ?? 300_000;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 900_000) throw new RangeError("Invalid authorization transaction lifetime");
  const scopes = new Set(options.scopes);
  if ([...scopes].some(scope => !scope || /[\s\x00-\x1f\x7f]/u.test(scope))) throw new TypeError("Invalid OAuth scope");
  if (oidc) scopes.add("openid");
  else if (scopes.has("openid")) throw new TypeError("Use the OIDC client for openid scope");
  const configuration = await discovery(issuer, options.clientId, options.clientMetadata, options.clientAuthentication, {
    algorithm: oidc ? "oidc" : "oauth2",
    execute: oidc ? [enableNonRepudiationChecks] : undefined,
  });
  const key = (state: string, binding: string) => transactionKey(issuer.href, options.clientId, state, binding);
  const now = options.now ?? Date.now;

  return {
    configuration,
    async begin(binding: string): Promise<URL> {
      if (!validBinding(binding)) throw new TypeError("Invalid authorization browser binding");
      const state = randomState();
      const verifier = randomPKCECodeVerifier();
      const nonce = oidc ? randomNonce() : undefined;
      const challenge = await calculatePKCECodeChallenge(verifier);
      const url = buildAuthorizationUrl(configuration, {
        redirect_uri: redirect.href,
        response_type: "code",
        scope: [...scopes].join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...(nonce ? { nonce } : {}),
      });
      await options.transactions.put(await key(state, binding), { verifier, nonce, expiresAt: now() + ttl });
      return url;
    },
    async complete(callback: URL, binding: string) {
      const url = new URL(callback);
      const state = url.searchParams.get("state");
      if (!secureUrl(url) || url.origin !== redirect.origin || url.pathname !== redirect.pathname
        || url.searchParams.getAll("state").length !== 1 || !state || !validBinding(state) || !validBinding(binding)) {
        throw new ExternalAuthorizationError("INVALID_CALLBACK");
      }
      const transaction = await options.transactions.consume(await key(state, binding), now());
      if (!transaction) throw new ExternalAuthorizationError("INVALID_TRANSACTION");
      try {
        return await authorizationCodeGrant(configuration, url, {
          expectedState: state,
          pkceCodeVerifier: transaction.verifier,
          expectedNonce: transaction.nonce,
          idTokenExpected: oidc,
        });
      } catch {
        throw new ExternalAuthorizationError("PROVIDER_REJECTED");
      }
    },
  };
}

export async function createOAuthClient(options: AuthorizationCodeOptions) {
  const { begin, complete } = await createAuthorizationFlow(options, false);
  return { begin, complete };
}

export function createMemoryAuthorizationTransactionStore(options: {
  capacity?: number;
  now?: () => number;
} = {}): AuthorizationTransactionStore {
  const capacity = options.capacity ?? 500;
  const clock = options.now ?? Date.now;
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("Invalid transaction store capacity");
  const transactions = new Map<string, AuthorizationTransaction>();
  return {
    async put(key, transaction) {
      const now = clock();
      for (const [id, existing] of transactions) {
        if (existing.expiresAt <= now) transactions.delete(id);
      }
      if (transactions.has(key) || transactions.size >= capacity) throw new Error("Authorization transaction store unavailable");
      transactions.set(key, { ...transaction });
    },
    async consume(key, now) {
      const transaction = transactions.get(key);
      transactions.delete(key);
      return transaction && transaction.expiresAt > now ? transaction : undefined;
    },
  };
}
