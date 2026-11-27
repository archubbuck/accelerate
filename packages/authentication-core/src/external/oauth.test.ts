import { afterEach, expect, it, vi } from "vitest";
import { createMemoryAuthorizationTransactionStore, createOAuthClient } from "./oauth.js";

afterEach(() => vi.unstubAllGlobals());

it("exchanges an OAuth code with PKCE and no OpenID scope", async () => {
  const issuer = "https://oauth.example";
  const redirect = "https://app.example/oauth/callback";
  const binding = "a".repeat(43);
  const fetcher = vi.fn(async (input: string | URL) => {
    if (new URL(input).pathname === "/.well-known/oauth-authorization-server") {
      return Response.json({
        issuer, authorization_endpoint: issuer + "/authorize", token_endpoint: issuer + "/token",
        response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
      });
    }
    if (new URL(input).pathname === "/token") {
      return Response.json({ access_token: "test-access-token", token_type: "Bearer" });
    }
    throw new Error("unexpected test URL");
  });
  vi.stubGlobal("fetch", fetcher);
  const client = await createOAuthClient({
    issuer: new URL(issuer), redirectUri: new URL(redirect), clientId: "client",
    scopes: ["read"], transactions: createMemoryAuthorizationTransactionStore(),
  });
  const start = await client.begin(binding);
  expect(start.searchParams.get("scope")).toBe("read");
  expect(start.searchParams.get("nonce")).toBeNull();
  const callback = new URL(redirect);
  callback.searchParams.set("state", start.searchParams.get("state")!);
  callback.searchParams.set("code", "test-code");
  await expect(client.complete(callback, binding)).resolves.toMatchObject({ access_token: "test-access-token" });
});
