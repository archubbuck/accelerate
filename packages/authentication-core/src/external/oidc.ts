import { buildEndSessionUrl } from "openid-client";
import { createAuthorizationFlow, ExternalAuthorizationError, type AuthorizationCodeOptions } from "./oauth.js";

export interface ExternalIdentity {
  issuer: string;
  subject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
}

/**
 * Look up or provision an identity by the validated issuer and subject.
 * Implementations must enforce uniqueness of the pair and explicitly authorize account linking.
 */
export interface ExternalIdentityResolver {
  resolveIdentity(profile: ExternalIdentity): Promise<string>;
}

export async function createOidcClient(options: AuthorizationCodeOptions & {
  identities: ExternalIdentityResolver;
  postLogoutRedirectUri?: URL;
}) {
  const flow = await createAuthorizationFlow(options, true);
  const logout = options.postLogoutRedirectUri && new URL(options.postLogoutRedirectUri);
  if (logout && (logout.protocol !== "https:" || logout.username || logout.password || logout.hash)) {
    throw new TypeError("Configure a fixed HTTPS logout callback");
  }
  return {
    begin: flow.begin,
    async complete(callback: URL, binding: string): Promise<{ identityId: string; idToken?: string }> {
      const tokens = await flow.complete(callback, binding);
      const claims = tokens.claims();
      if (!claims || typeof claims.iss !== "string" || typeof claims.sub !== "string" || !claims.sub) {
        throw new ExternalAuthorizationError("PROVIDER_REJECTED");
      }
      const identityId = await options.identities.resolveIdentity({
        issuer: claims.iss,
        subject: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        emailVerified: claims.email_verified === true,
        displayName: typeof claims.name === "string" ? claims.name : undefined,
      });
      if (!identityId) throw new ExternalAuthorizationError("PROVIDER_REJECTED");
      return { identityId, idToken: tokens.id_token };
    },
    logoutUrl(idToken: string): URL | undefined {
      if (!flow.configuration.serverMetadata().end_session_endpoint) return undefined;
      return buildEndSessionUrl(flow.configuration, {
        id_token_hint: idToken,
        ...(logout ? { post_logout_redirect_uri: logout.href } : {}),
      });
    },
  };
}
