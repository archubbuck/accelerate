import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryAuthorizationTransactionStore } from "./oauth.js";
import { createOidcClient } from "./oidc.js";

const issuer = "https://provider.example";
const redirect = "https://app.example/auth/provider";
const binding = "a".repeat(48);
const authResponse = (state: string) => new URL(`${redirect}?code=authorization-code&state=${state}`);
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
afterEach(() => vi.unstubAllGlobals());

async function fixture(claims: Record<string, unknown> = {}, invalidSignature = false) {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const resolveIdentity = vi.fn(async () => "user-123");
  let nonce: string | null;
  let challenge: string | null;
  let exchangeCount = 0;
  let clock = Date.now();
  const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
    switch (new URL(input).pathname) {
      case "/.well-known/openid-configuration":
        return Response.json({
          issuer,
          authorization_endpoint: issuer + "/authorize",
          token_endpoint: issuer + "/token",
          jwks_uri: issuer + "/jwks",
          end_session_endpoint: issuer + "/logout",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
        });
      case "/token": {
        exchangeCount++;
        const params = new URLSearchParams(String(init?.body));
        expect(params.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
        expect(createHash("sha256").update(params.get("code_verifier")!).digest("base64url")).toBe(challenge);
        expect(params.get("redirect_uri")).toBe(redirect);
        const iat = Math.floor(Date.now() / 1000);
        const parts = encode({ alg: "RS256", kid: "test" }) + "." + encode({
          iss: issuer, sub: "provider-sub", aud: "my-client", nonce, iat, exp: iat + 120, ...claims,
        });
        const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(parts)));
        if (invalidSignature) signature[0] ^= 1;
        return Response.json({
          access_token: "provider-access-token", token_type: "Bearer",
          id_token: parts + "." + Buffer.from(signature).toString("base64url"),
        });
      }
      case "/jwks": return Response.json({ keys: [{ ...jwk, kid: "test", alg: "RS256", use: "sig" }] });
      default: throw new Error("unexpected test URL");
    }
  });
  vi.stubGlobal("fetch", fetcher);
  const now = () => clock;
  const client = await createOidcClient({
    issuer: new URL(issuer), clientId: "my-client", redirectUri: new URL(redirect),
    scopes: ["profile"], identities: { resolveIdentity }, now,
    transactions: createMemoryAuthorizationTransactionStore({ now }), transactionTtlMs: 1000,
  });
  const start = await client.begin(binding);
  nonce = start.searchParams.get("nonce");
  challenge = start.searchParams.get("code_challenge");
  return {
    client, start, resolveIdentity,
    callback: authResponse(start.searchParams.get("state")!),
    exchangeCount: () => exchangeCount,
    expire: () => { clock += 1000; },
  };
}

it("validates PKCE, signed identity, binding, callback location, and one-time state", async () => {
  const flow = await fixture();
  expect(flow.start.searchParams.get("code_challenge_method")).toBe("S256");
  expect(flow.start.searchParams.get("scope")).toBe("profile openid");
  await expect(flow.client.complete(flow.callback, "b".repeat(48))).rejects.toMatchObject({ code: "INVALID_TRANSACTION" });
  const other = new URL(flow.callback);
  other.pathname += "/other";
  await expect(flow.client.complete(other, binding)).rejects.toMatchObject({ code: "INVALID_CALLBACK" });
  const result = await flow.client.complete(flow.callback, binding);
  expect(result.identityId).toBe("user-123");
  expect(flow.resolveIdentity).toHaveBeenCalledWith(expect.objectContaining({ issuer, subject: "provider-sub" }));
  expect(flow.client.logoutUrl(result.idToken!)?.pathname).toBe("/logout");
  await expect(flow.client.complete(flow.callback, binding)).rejects.toMatchObject({ code: "INVALID_TRANSACTION" });
  expect(flow.exchangeCount()).toBe(1);
});

it.each([
  { claims: { nonce: "other" } },
  { claims: { aud: "other-client" } },
  { claims: { iss: "https://other.example" } },
  { claims: { exp: 1 } },
  { claims: {}, invalidSignature: true },
])("rejects invalid provider tokens without invoking identity resolution %#", async ({ claims, invalidSignature }) => {
  const flow = await fixture(claims, invalidSignature);
  await expect(flow.client.complete(flow.callback, binding)).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });
  expect(flow.resolveIdentity).not.toHaveBeenCalled();
});

it("rejects an expired transaction before contacting the token endpoint", async () => {
  const flow = await fixture();
  flow.expire();
  await expect(flow.client.complete(flow.callback, binding)).rejects.toMatchObject({ code: "INVALID_TRANSACTION" });
  expect(flow.exchangeCount()).toBe(0);
});
