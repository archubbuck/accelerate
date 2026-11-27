import type { PermissionRegistry } from "./index.js";

export type GrantScope =
  | { kind: "global" }
  | { kind: "tenant"; tenantId: string }
  | { kind: "resource"; tenantId: string; resourceType: string; resourceId: string };

export interface ScopedSubject {
  id: string;
  tenantId?: string;
}

export interface ScopedAuthorizationContext {
  subject: ScopedSubject;
  /** Resolve this scope from server-side resource data, not from client assertions. */
  scope: GrantScope;
  ownerId?: string;
  attributes?: Readonly<Record<string, unknown>>;
}

export interface ScopedRoleAssignment {
  userId: string;
  roleId: string;
  scope: GrantScope;
}

export interface ScopedRoleGrant {
  roleKey: string;
  scope: GrantScope;
}

export interface ScopedGrantStore {
  findGrants(subjectId: string, permission: string, scope: GrantScope): Promise<readonly ScopedRoleGrant[]>;
  changeAssignment(change: {
    action: "assign" | "revoke";
    actorId: string;
    assignment: ScopedRoleAssignment;
  }): Promise<boolean>;
}

export interface ScopedPolicy<K extends string> {
  id: string;
  check(context: ScopedAuthorizationContext, permission: K): "deny" | "allow" | "abstain" | Promise<"deny" | "allow" | "abstain">;
}

export interface ScopedDecision<K extends string> {
  allowed: boolean;
  permission: K;
  reason: "GRANTED" | "INVALID_CONTEXT" | "CROSS_TENANT" | "PERMISSION_UNKNOWN" | "PERMISSION_NOT_GRANTED" | "POLICY_DENIED" | "EVALUATION_FAILED";
  matchedRoles: readonly string[];
  deniedBy?: string;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function isGrantScope(input: unknown): input is GrantScope {
  if (!input || typeof input !== "object" || !("kind" in input)) return false;
  if (input.kind === "global") return !("tenantId" in input || "resourceType" in input || "resourceId" in input);
  if (!("tenantId" in input) || !validId(input.tenantId)) return false;
  if (input.kind === "tenant") return !("resourceType" in input || "resourceId" in input);
  return input.kind === "resource" && "resourceType" in input && validId(input.resourceType)
    && "resourceId" in input && validId(input.resourceId);
}

function applies(assigned: GrantScope, target: GrantScope): boolean {
  if (assigned.kind === "global" || target.kind === "global") return assigned.kind === target.kind;
  if (assigned.tenantId !== target.tenantId) return false;
  if (assigned.kind === "tenant") return true;
  return target.kind === "resource" && assigned.resourceType === target.resourceType && assigned.resourceId === target.resourceId;
}

export function createScopedAuthorization<K extends string>(options: {
  permissions: PermissionRegistry<K>;
  store: ScopedGrantStore;
  policies?: readonly ScopedPolicy<K>[];
  authorizeAssignment?: (actor: ScopedSubject, assignment: ScopedRoleAssignment, action: "assign" | "revoke") => Promise<boolean>;
}) {
  const known = new Set(options.permissions.keys);
  const policies = [...(options.policies ?? [])];
  async function evaluate(context: ScopedAuthorizationContext, permission: K): Promise<ScopedDecision<K>> {
    const deny = (reason: ScopedDecision<K>["reason"], deniedBy?: string): ScopedDecision<K> => ({
      allowed: false, permission, reason, matchedRoles: [], ...(deniedBy ? { deniedBy } : {}),
    });
    if (!known.has(permission)) return deny("PERMISSION_UNKNOWN");
    if (!context || !validId(context.subject?.id) || !isGrantScope(context.scope)
      || (context.ownerId !== undefined && !validId(context.ownerId))) return deny("INVALID_CONTEXT");
    if (context.scope.kind === "global" ? context.subject.tenantId !== undefined : context.subject.tenantId !== context.scope.tenantId) {
      return deny("CROSS_TENANT");
    }
    try {
      const grants = await options.store.findGrants(context.subject.id, permission, context.scope);
      const matchedRoles = [...new Set(grants
        .filter(grant => isGrantScope(grant.scope) && applies(grant.scope, context.scope))
        .map(grant => grant.roleKey))].sort();
      if (matchedRoles.length === 0) return deny("PERMISSION_NOT_GRANTED");
      for (const policy of policies) {
        const decision = await policy.check(context, permission);
        if (decision === "deny") return deny("POLICY_DENIED", policy.id);
        if (decision !== "allow" && decision !== "abstain") return deny("EVALUATION_FAILED");
      }
      return { allowed: true, permission, reason: "GRANTED", matchedRoles };
    } catch {
      return deny("EVALUATION_FAILED");
    }
  }

  return {
    evaluate,
    async can(context: ScopedAuthorizationContext, permission: K) {
      return (await evaluate(context, permission)).allowed;
    },
    async changeRole(actor: ScopedSubject, action: "assign" | "revoke", assignment: ScopedRoleAssignment) {
      if (!actor || !validId(actor.id) || !assignment || !validId(assignment.userId) || !validId(assignment.roleId)
        || !isGrantScope(assignment.scope) || (action !== "assign" && action !== "revoke")) {
        throw new TypeError("Invalid scoped role change");
      }
      if ((actor.tenantId !== undefined && (assignment.scope.kind === "global" || actor.tenantId !== assignment.scope.tenantId))
        || !(await options.authorizeAssignment?.(actor, assignment, action))) {
        throw new Error("Scoped assignment is not authorized");
      }
      return options.store.changeAssignment({ action, actorId: actor.id, assignment });
    },
  };
}

export function ownerOnlyPolicy<K extends string>(id: string, permissions: readonly K[]): ScopedPolicy<K> {
  const protectedPermissions = new Set(permissions);
  return { id, check: (context, permission) => !protectedPermissions.has(permission) ? "abstain"
    : context.ownerId === context.subject.id ? "allow" : "deny" };
}
