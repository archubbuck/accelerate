import { randomBytes } from "node:crypto";
import { issueApiKey, verifyApiKey, type ApiKeyRecord } from "./index.js";

export interface ServicePrincipal {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
}

export interface ServiceCredential extends ApiKeyRecord {
  readonly permissions: readonly string[];
}

export interface ServiceAuthentication {
  readonly principal: ServicePrincipal;
  readonly credentialId: string;
  readonly permissions: readonly string[];
}

export interface ServiceCredentialStore {
  findPrincipal(id: string): Promise<ServicePrincipal | undefined>;
  findCredential(id: string): Promise<ServiceCredential | undefined>;
  getByPrefix(prefix: string): Promise<readonly ServiceCredential[]>;
  addPrincipal(actorId: string, principal: ServicePrincipal, at: Date): Promise<void>;
  issue(actorId: string, credential: ServiceCredential): Promise<boolean>;
  rotate(actorId: string, previousId: string, replacement: ServiceCredential): Promise<boolean>;
  revoke(actorId: string, principalId: string, credentialId: string, at: Date): Promise<boolean>;
  deactivate(actorId: string, principalId: string, at: Date): Promise<boolean>;
  recordUse(credentialId: string, at: Date): Promise<ServicePrincipal | undefined>;
}

type AdminAction = "create" | "issue" | "rotate" | "revoke" | "deactivate";
const validId = (value: unknown): value is string => typeof value === "string"
  && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);

export function extractServiceCredential(header: string | undefined) {
  return /^Bearer (ak_[0-9a-f]{16}_[A-Za-z0-9_-]{43})$/i.exec(header ?? "")?.[1];
}

export function createServiceCredentials(options: {
  store: ServiceCredentialStore;
  permissions: readonly string[];
  authorize: (actorId: string, action: AdminAction, target: Pick<ServicePrincipal, "id" | "tenantId">) => Promise<boolean>;
  now?: () => Date;
}) {
  const { store } = options;
  const registered = new Set(options.permissions);
  const now = () => {
    const value = new Date((options.now ?? (() => new Date()))().getTime());
    if (!Number.isFinite(value.getTime())) throw new RangeError("Invalid service credential time");
    return value;
  };

  async function authorize(actorId: string, action: AdminAction, target: Pick<ServicePrincipal, "id" | "tenantId">) {
    if (!validId(actorId) || !await options.authorize(actorId, action, target)) throw new Error("Service credential operation is not authorized");
  }

  async function principal(actorId: string, action: AdminAction, principalId: string) {
    if (!validId(principalId)) throw new TypeError("Invalid service principal");
    const target = await store.findPrincipal(principalId);
    if (!target) throw new Error("Unknown service principal");
    await authorize(actorId, action, target);
    return target;
  }

  function createKey(principalId: string, permissions: readonly string[], expiresAt: Date) {
    const unique = [...new Set(permissions)];
    if (!unique.length || unique.some(permission => !registered.has(permission))) {
      throw new TypeError("Service credentials require registered permissions");
    }
    const { token, record } = issueApiKey(principalId, now(), new Date(expiresAt.getTime()));
    return { token, credential: { ...record, permissions: unique } };
  }

  return {
    async createPrincipal(actorId: string, input: { tenantId: string; name: string }) {
      if (!validId(input.tenantId) || !validId(input.name)) throw new TypeError("Invalid service principal");
      const target = { id: "svc_" + randomBytes(16).toString("hex"), tenantId: input.tenantId, name: input.name, active: true };
      await authorize(actorId, "create", target);
      await store.addPrincipal(actorId, target, now());
      return target;
    },
    async issue(actorId: string, principalId: string, permissions: readonly string[], expiresAt: Date) {
      const target = await principal(actorId, "issue", principalId);
      const { token, credential } = createKey(target.id, permissions, expiresAt);
      if (!await store.issue(actorId, credential)) throw new Error("Service principal is inactive");
      return { token, credentialId: credential.id, expiresAt: credential.expiresAt };
    },
    async rotate(actorId: string, principalId: string, credentialId: string, expiresAt: Date) {
      const target = await principal(actorId, "rotate", principalId);
      const previous = await store.findCredential(credentialId);
      if (!previous || previous.subjectId !== target.id) throw new Error("Unknown service credential");
      const { token, credential } = createKey(target.id, previous.permissions, expiresAt);
      if (!await store.rotate(actorId, credentialId, credential)) throw new Error("Service credential is inactive");
      return { token, credentialId: credential.id, expiresAt: credential.expiresAt };
    },
    async revoke(actorId: string, principalId: string, credentialId: string) {
      const target = await principal(actorId, "revoke", principalId);
      return store.revoke(actorId, target.id, credentialId, now());
    },
    async deactivate(actorId: string, principalId: string) {
      const target = await principal(actorId, "deactivate", principalId);
      return store.deactivate(actorId, target.id, now());
    },
    async authenticate(authorizationHeader: string | undefined): Promise<ServiceAuthentication | undefined> {
      const token = extractServiceCredential(authorizationHeader);
      if (!token) return undefined;
      const credential = await verifyApiKey(token, store, now());
      if (!credential) return undefined;
      const target = await store.recordUse(credential.id, now());
      if (!target || !target.active || target.id !== credential.subjectId) return undefined;
      const permissions = credential.permissions.filter(permission => registered.has(permission));
      return permissions.length ? { principal: target, credentialId: credential.id, permissions } : undefined;
    },
  };
}
