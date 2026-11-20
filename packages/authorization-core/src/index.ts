export type PermissionKey = string;
export type PermissionCatalog = Readonly<Record<string, Readonly<Record<string, string>>>>;
export type CatalogKeys<T extends PermissionCatalog> = { [R in keyof T & string]: `${R}.${keyof T[R] & string}` }[keyof T & string];
export interface PermissionRegistry<K extends string = string> {
  readonly keys: readonly K[];
  readonly descriptions: Readonly<Record<K, string>>;
}
export function definePermissions<const T extends PermissionCatalog>(catalog: T): PermissionRegistry<CatalogKeys<T>> {
  const descriptions: Record<string, string> = Object.create(null);
  for (const [resource, actions] of Object.entries(catalog)) {
    if (!resource.trim() || resource.includes(".")) throw new Error("Invalid permission resource");
    for (const [action, description] of Object.entries(actions)) {
      if (!action.trim() || action.includes(".")) throw new Error("Invalid permission action");
      if (typeof description !== "string" || !description.trim()) throw new Error("Permission description required");
      descriptions[`${resource}.${action}`] = description;
    }
  }
  return Object.freeze({ keys: Object.freeze(Object.keys(descriptions)) as CatalogKeys<T>[], descriptions: Object.freeze(descriptions) as Record<CatalogKeys<T>, string> });
}
export interface Role { id: string; key: string; name: string; active: boolean; }
export interface AuthorizationStore {
  createRole(role: Role): Promise<void>;
  getRole(id: string): Promise<Role | undefined>;
  getRolesForUser(userId: string): Promise<readonly Role[]>;
  getPermissionKeysForRole(roleId: string): Promise<readonly string[]>;
  grant(roleId: string, permission: string): Promise<void>;
  revoke(roleId: string, permission: string): Promise<void>;
  assign(userId: string, roleId: string): Promise<void>;
  unassign(userId: string, roleId: string): Promise<void>;
}
export interface Evaluation<K extends string> {
  allowed: boolean;
  permission: K;
  matchedRoles: string[];
  reason: "GRANTED" | "PERMISSION_NOT_GRANTED" | "PERMISSION_UNKNOWN";
}
export function createAuthorization<K extends string>(options: { permissions: PermissionRegistry<K>; store: AuthorizationStore }) {
  const known = new Set<string>(options.permissions.keys);
  async function evaluate(userId: string, permission: K): Promise<Evaluation<K>> {
    if (!known.has(permission)) return { allowed: false, permission, matchedRoles: [], reason: "PERMISSION_UNKNOWN" };
    const roles = (await options.store.getRolesForUser(userId)).filter(r => r.active);
    const matches: string[] = [];
    for (const role of roles) {
      if ((await options.store.getPermissionKeysForRole(role.id)).includes(permission)) matches.push(role.key);
    }
    return { allowed: matches.length > 0, permission, matchedRoles: matches, reason: matches.length ? "GRANTED" : "PERMISSION_NOT_GRANTED" };
  }
  return {
    evaluate,
    can: async (userId: string, permission: K) => (await evaluate(userId, permission)).allowed,
    canAll: async (userId: string, permissions: readonly K[]) => permissions.length > 0 && (await Promise.all(permissions.map(p => evaluate(userId, p)))).every(r => r.allowed),
    canAny: async (userId: string, permissions: readonly K[]) => (await Promise.all(permissions.map(p => evaluate(userId, p)))).some(r => r.allowed),
    admin: {
      createRole: (role: Role) => options.store.createRole(role),
      grant: (roleId: string, permission: K) => {
        if (!known.has(permission)) throw new Error("Unregistered permission");
        return options.store.grant(roleId, permission);
      },
      revoke: (roleId: string, permission: K) => {
        if (!known.has(permission)) throw new Error("Unregistered permission");
        return options.store.revoke(roleId, permission);
      },
      assignRole: (userId: string, roleId: string) => options.store.assign(userId, roleId),
      removeRole: (userId: string, roleId: string) => options.store.unassign(userId, roleId)
    }
  };
}
export class MemoryAuthorizationStore implements AuthorizationStore {
  private roles = new Map<string, Role>();
  private grants = new Map<string, Set<string>>();
  private assignments = new Map<string, Set<string>>();
  async createRole(role: Role) {
    if (this.roles.has(role.id) || [...this.roles.values()].some(r => r.key === role.key)) throw new Error("Duplicate role");
    this.roles.set(role.id, { ...role });
  }
  async getRole(id: string) { const role = this.roles.get(id); return role && { ...role }; }
  async getRolesForUser(userId: string) {
    return [...(this.assignments.get(userId) ?? [])].map(id => this.roles.get(id)).filter((r): r is Role => !!r).map(r => ({ ...r }));
  }
  async getPermissionKeysForRole(id: string) { return [...(this.grants.get(id) ?? [])]; }
  async grant(id: string, permission: string) {
    if (!this.roles.has(id)) throw new Error("Unknown role");
    const permissions = this.grants.get(id) ?? new Set<string>();
    permissions.add(permission); this.grants.set(id, permissions);
  }
  async revoke(id: string, permission: string) { this.grants.get(id)?.delete(permission); }
  async assign(userId: string, id: string) {
    if (!this.roles.has(id)) throw new Error("Unknown role");
    const roles = this.assignments.get(userId) ?? new Set<string>();
    roles.add(id); this.assignments.set(userId, roles);
  }
  async unassign(userId: string, id: string) { this.assignments.get(userId)?.delete(id); }
}
