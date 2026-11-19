import type { Pool } from "pg";
import type { AuthorizationStore, Role } from "@accelerate/authorization-core";

/**
 * A PostgreSQL-backed store. Run schema.sql before use.
 * Pass an existing pg Pool; the calling application owns its lifecycle.
 * Administrative access control must be enforced before calling mutating methods.
 */
export class PostgresAuthorizationStore implements AuthorizationStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async createRole(role: Role): Promise<void> {
    await this.pool.query(
      "INSERT INTO authorization_roles (id, role_key, name, active) VALUES ($1, $2, $3, $4)",
      [role.id, role.key, role.name, role.active]
    );
  }

  async getRole(id: string): Promise<Role | undefined> {
    const result = await this.pool.query(
      "SELECT id, role_key AS key, name, active FROM authorization_roles WHERE id = $1", [id]
    );
    return result.rows[0] as Role | undefined;
  }

  async getRolesForUser(userId: string): Promise<readonly Role[]> {
    const result = await this.pool.query(
      `SELECT r.id, r.role_key AS key, r.name, r.active
       FROM authorization_roles r
       JOIN authorization_user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`, [userId]
    );
    return result.rows as Role[];
  }

  async getPermissionKeysForRole(roleId: string): Promise<readonly string[]> {
    const result = await this.pool.query(
      "SELECT permission_key FROM authorization_role_permissions WHERE role_id = $1", [roleId]
    );
    return result.rows.map((row: { permission_key: string }) => row.permission_key);
  }

  async grant(roleId: string, permission: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO authorization_role_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [roleId, permission]
    );
  }

  async revoke(roleId: string, permission: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM authorization_role_permissions WHERE role_id = $1 AND permission_key = $2",
      [roleId, permission]
    );
  }

  async assign(userId: string, roleId: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO authorization_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, roleId]
    );
  }

  async unassign(userId: string, roleId: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM authorization_user_roles WHERE user_id = $1 AND role_id = $2",
      [userId, roleId]
    );
  }
}
