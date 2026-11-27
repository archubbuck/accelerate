import type { Pool } from "pg";
import { isGrantScope, type GrantScope, type ScopedGrantStore, type ScopedRoleGrant } from "@accelerate/authorization-core/scoped";

/** Apply after the existing authorization schema. */
export const scopedAuthorizationSchema = [
  `CREATE TABLE IF NOT EXISTS authorization_scoped_assignments (
    user_id text NOT NULL,
    role_id text NOT NULL REFERENCES authorization_roles(id) ON DELETE CASCADE,
    kind text NOT NULL,
    tenant_id text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    PRIMARY KEY (user_id, kind, tenant_id, resource_type, resource_id, role_id),
    CHECK (
      (kind = 'global' AND tenant_id = '' AND resource_type = '' AND resource_id = '') OR
      (kind = 'tenant' AND tenant_id <> '' AND resource_type = '' AND resource_id = '') OR
      (kind = 'resource' AND tenant_id <> '' AND resource_type <> '' AND resource_id <> '')
    )
  )`,
  `CREATE TABLE IF NOT EXISTS authorization_scoped_assignment_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id text NOT NULL, action text NOT NULL CHECK (action IN ('assign','revoke')),
    user_id text NOT NULL, role_id text NOT NULL, kind text NOT NULL,
    tenant_id text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
  )`,
] as const;

function fields(scope: GrantScope): [string, string, string, string] {
  if (!isGrantScope(scope)) throw new TypeError("Invalid grant scope");
  switch (scope.kind) {
    case "global": return ["global", "", "", ""];
    case "tenant": return ["tenant", scope.tenantId, "", ""];
    case "resource": return ["resource", scope.tenantId, scope.resourceType, scope.resourceId];
  }
}

interface GrantRow {
  role_key: string;
  kind: GrantScope["kind"];
  tenant_id: string;
  resource_type: string;
  resource_id: string;
}

function fromRow(row: GrantRow): ScopedRoleGrant {
  const scope: GrantScope = row.kind === "global" ? { kind: "global" }
    : row.kind === "tenant" ? { kind: "tenant", tenantId: row.tenant_id }
    : { kind: "resource", tenantId: row.tenant_id, resourceType: row.resource_type, resourceId: row.resource_id };
  return { roleKey: row.role_key, scope };
}

export function createPostgresScopedGrantStore(pool: Pick<Pool, "query">): ScopedGrantStore {
  return {
    async findGrants(subjectId, permission, scope) {
      const result = await pool.query<GrantRow>(
        `SELECT role.role_key, assignment.kind, assignment.tenant_id, assignment.resource_type, assignment.resource_id
         FROM authorization_scoped_assignments assignment
         JOIN authorization_roles role ON role.id = assignment.role_id AND role.active
         JOIN authorization_role_permissions grant_row ON grant_row.role_id = role.id
         WHERE assignment.user_id = $1 AND grant_row.permission_key = $2
           AND ((assignment.kind = 'global' AND $3 = 'global')
             OR (assignment.tenant_id = $4 AND $3 <> 'global'
               AND (assignment.kind = 'tenant' OR (assignment.kind = 'resource' AND $3 = 'resource'
                 AND assignment.resource_type = $5 AND assignment.resource_id = $6))))`,
        [subjectId, permission, ...fields(scope)],
      );
      return result.rows.map(fromRow);
    },
    async changeAssignment({ action, actorId, assignment }) {
      const statement = action === "assign"
        ? `INSERT INTO authorization_scoped_assignments (user_id, role_id, kind, tenant_id, resource_type, resource_id)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING user_id`
        : `DELETE FROM authorization_scoped_assignments WHERE user_id = $1 AND role_id = $2
             AND kind = $3 AND tenant_id = $4 AND resource_type = $5 AND resource_id = $6 RETURNING user_id`;
      const result = await pool.query(
        `WITH changed AS (${statement})
         INSERT INTO authorization_scoped_assignment_audit
           (user_id, role_id, kind, tenant_id, resource_type, resource_id, actor_id, action)
         SELECT user_id, $2, $3, $4, $5, $6, $7, $8 FROM changed`,
        [assignment.userId, assignment.roleId, ...fields(assignment.scope), actorId, action],
      );
      return result.rowCount === 1;
    },
  };
}
