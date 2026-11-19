import type { Pool, PoolClient } from "pg";
import type { PermissionRegistry, Role } from "@accelerate/authorization-core";

export type AdminAction =
  | "role.create" | "role.activate" | "role.deactivate"
  | "permission.grant" | "permission.revoke"
  | "role.assign" | "role.unassign";
export interface AdminContext {
  /** Identity resolved by trusted server-side authentication, never from request input. */
  actorId: string;
}
export interface AdminPolicy {
  /** Server-owned policy; deny by default. */
  authorize(context: AdminContext, action: AdminAction): Promise<boolean>;
}
export interface AuditEvent {
  id: string;
  occurredAt: Date;
  actorId: string;
  action: AdminAction;
  targetId: string;
  details: Record<string, string | boolean>;
}

/**
 * Transactional administrative mutations and append-only audit records.
 * Run schema.sql and admin.sql before use. Application owns the pool lifecycle.
 */
export class PostgresAuthorizationAdmin {
  private readonly known: ReadonlySet<string>;
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    registry: PermissionRegistry,
    private readonly policy: AdminPolicy
  ) {
    this.known = new Set(registry.keys);
  }

  private async mutate(
    context: AdminContext,
    action: AdminAction,
    targetId: string,
    details: Record<string, string | boolean>,
    apply: (client: PoolClient) => Promise<void>
  ): Promise<void> {
    if (!context.actorId?.trim()) throw new Error("Authenticated actor is required");
    if (!await this.policy.authorize(context, action)) throw new Error("Forbidden");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await apply(client);
      await client.query(
        "INSERT INTO authorization_audit_events (actor_id, action, target_id, details) VALUES ($1, $2, $3, $4::jsonb)",
        [context.actorId, action, targetId, JSON.stringify(details)]
      );
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async createRole(context: AdminContext, role: Role): Promise<void> {
    await this.mutate(context, "role.create", role.id, { key: role.key, name: role.name, active: role.active },
      async client => { await client.query(
        "INSERT INTO authorization_roles (id, role_key, name, active) VALUES ($1, $2, $3, $4)",
        [role.id, role.key, role.name, role.active]
      ); });
  }

  async setRoleActive(context: AdminContext, roleId: string, active: boolean): Promise<void> {
    await this.mutate(context, active ? "role.activate" : "role.deactivate", roleId, { active },
      async client => {
        const result = await client.query("UPDATE authorization_roles SET active = $2 WHERE id = $1", [roleId, active]);
        if (!result.rowCount) throw new Error("Unknown role");
      });
  }

  async grant(context: AdminContext, roleId: string, permission: string): Promise<void> {
    if (!this.known.has(permission)) throw new Error("Unregistered permission");
    await this.mutate(context, "permission.grant", roleId, { permission },
      async client => { await client.query(
        "INSERT INTO authorization_role_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [roleId, permission]
      ); });
  }

  async revoke(context: AdminContext, roleId: string, permission: string): Promise<void> {
    if (!this.known.has(permission)) throw new Error("Unregistered permission");
    await this.mutate(context, "permission.revoke", roleId, { permission },
      async client => { await client.query(
        "DELETE FROM authorization_role_permissions WHERE role_id = $1 AND permission_key = $2",
        [roleId, permission]
      ); });
  }

  async assign(context: AdminContext, userId: string, roleId: string): Promise<void> {
    await this.mutate(context, "role.assign", userId, { roleId },
      async client => { await client.query(
        "INSERT INTO authorization_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, roleId]
      ); });
  }

  async unassign(context: AdminContext, userId: string, roleId: string): Promise<void> {
    await this.mutate(context, "role.unassign", userId, { roleId },
      async client => { await client.query(
        "DELETE FROM authorization_user_roles WHERE user_id = $1 AND role_id = $2",
        [userId, roleId]
      ); });
  }

  async listAuditEvents(context: AdminContext, limit = 100): Promise<readonly AuditEvent[]> {
    if (!context.actorId?.trim() || !await this.policy.authorize(context, "role.create"))
      throw new Error("Forbidden");
    const size = Math.max(1, Math.min(500, Math.trunc(limit) || 100));
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT id::text, occurred_at, actor_id, action, target_id, details FROM authorization_audit_events ORDER BY id DESC LIMIT $1",
        [size]
      );
      return result.rows.map(row => ({
        id: row.id as string,
        occurredAt: row.occurred_at as Date,
        actorId: row.actor_id as string,
        action: row.action as AdminAction,
        targetId: row.target_id as string,
        details: row.details as Record<string, string | boolean>
      }));
    } finally { client.release(); }
  }
}
