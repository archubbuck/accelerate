import { randomUUID } from "node:crypto";
import type { Database, QueryExecutor } from "@accelerate/data-core";
import { appendPostgresAuditEvent } from "@accelerate/audit-postgres";
import type { ServiceCredential, ServiceCredentialStore, ServicePrincipal } from "./service.js";

/** Apply through the application's migration runner after the audit schema. */
export const serviceCredentialSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_service_principals (
    id text PRIMARY KEY, tenant_id text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_service_credentials (
    id text PRIMARY KEY, prefix text UNIQUE NOT NULL, digest text NOT NULL,
    principal_id text NOT NULL REFERENCES accelerate_service_principals(id),
    permissions text[] NOT NULL, created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
    revoked_at timestamptz, last_used_at timestamptz,
    CHECK (cardinality(permissions) > 0)
  )`,
  `CREATE INDEX IF NOT EXISTS accelerate_service_credentials_principal_idx
    ON accelerate_service_credentials (principal_id)`,
] as const;

interface KeyRow {
  id: string;
  prefix: string;
  digest: string;
  principal_id: string;
  permissions: string[];
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

function key(row: KeyRow): ServiceCredential {
  return {
    id: row.id, prefix: row.prefix, hash: row.digest, subjectId: row.principal_id,
    permissions: row.permissions, createdAt: row.created_at,
    expiresAt: row.expires_at, revokedAt: row.revoked_at ?? undefined,
  };
}

const columns = "id, prefix, digest, principal_id, permissions, created_at, expires_at, revoked_at";
async function lockPrincipal(tx: QueryExecutor, id: string) {
  const result = await tx.query("SELECT id FROM accelerate_service_principals WHERE id = $1 AND active FOR UPDATE", [id]);
  return result.rowCount === 1;
}

async function insertKey(tx: QueryExecutor, credential: ServiceCredential) {
  await tx.query(
    "INSERT INTO accelerate_service_credentials (id, prefix, digest, principal_id, permissions, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [credential.id, credential.prefix, credential.hash, credential.subjectId, credential.permissions, credential.createdAt, credential.expiresAt],
  );
}

async function audit(tx: QueryExecutor, actorId: string, action: string, principalId: string, at: Date, credentialId?: string) {
  await appendPostgresAuditEvent(tx, {
    id: randomUUID(), occurredAt: at, actorId, action, resource: "service-principal",
    resourceId: principalId, outcome: "success", metadata: credentialId ? { credentialId } : undefined,
  });
}

export function createPostgresServiceCredentialStore(db: Database): ServiceCredentialStore {
  return {
    async findPrincipal(id) {
      return (await db.query<ServicePrincipal>(
        'SELECT id, tenant_id AS "tenantId", name, active FROM accelerate_service_principals WHERE id = $1', [id],
      )).rows[0];
    },
    async findCredential(id) {
      const row = (await db.query<KeyRow>(`SELECT ${columns} FROM accelerate_service_credentials WHERE id = $1`, [id])).rows[0];
      return row && key(row);
    },
    async getByPrefix(prefix) {
      return (await db.query<KeyRow>(
        `SELECT ${columns} FROM accelerate_service_credentials WHERE prefix = $1`, [prefix],
      )).rows.map(key);
    },
    async addPrincipal(actorId, principal, at) {
      await db.transaction(async tx => {
        await tx.query("INSERT INTO accelerate_service_principals (id, tenant_id, name, active) VALUES ($1,$2,$3,$4)",
          [principal.id, principal.tenantId, principal.name, principal.active]);
        await audit(tx, actorId, "service-principal.create", principal.id, at);
      });
    },
    async issue(actorId, credential) {
      return db.transaction(async tx => {
        if (!await lockPrincipal(tx, credential.subjectId)) return false;
        await insertKey(tx, credential);
        await audit(tx, actorId, "service-credential.issue", credential.subjectId, credential.createdAt, credential.id);
        return true;
      });
    },
    async rotate(actorId, previousId, replacement) {
      return db.transaction(async tx => {
        if (!await lockPrincipal(tx, replacement.subjectId)) return false;
        const retired = await tx.query(
          `UPDATE accelerate_service_credentials SET revoked_at = $3
           WHERE id = $1 AND principal_id = $2 AND revoked_at IS NULL AND expires_at > $3
              AND created_at <= $3`,
          [previousId, replacement.subjectId, replacement.createdAt],
        );
        if (retired.rowCount !== 1) return false;
        await insertKey(tx, replacement);
        await audit(tx, actorId, "service-credential.rotate", replacement.subjectId, replacement.createdAt, previousId);
        return true;
      });
    },
    async revoke(actorId, principalId, credentialId, at) {
      return db.transaction(async tx => {
        const retired = await tx.query(
          "UPDATE accelerate_service_credentials SET revoked_at = $3 WHERE id = $1 AND principal_id = $2 AND revoked_at IS NULL",
          [credentialId, principalId, at],
        );
        if (retired.rowCount !== 1) return false;
        await audit(tx, actorId, "service-credential.revoke", principalId, at, credentialId);
        return true;
      });
    },
    async deactivate(actorId, principalId, at) {
      return db.transaction(async tx => {
        const retired = await tx.query("UPDATE accelerate_service_principals SET active = false WHERE id = $1 AND active", [principalId]);
        if (retired.rowCount !== 1) return false;
        await audit(tx, actorId, "service-principal.deactivate", principalId, at);
        return true;
      });
    },
    async recordUse(credentialId, at) {
      return db.transaction(async tx => {
        const record = (await tx.query<ServicePrincipal>(
          `SELECT p.id, p.tenant_id AS "tenantId", p.name, p.active
           FROM accelerate_service_principals p JOIN accelerate_service_credentials c ON c.principal_id = p.id
           WHERE c.id = $1 AND p.active FOR UPDATE OF p`, [credentialId],
        )).rows[0];
        if (!record) return undefined;
        const updated = await tx.query(
          `UPDATE accelerate_service_credentials SET last_used_at = GREATEST(last_used_at, $2)
           WHERE id = $1 AND revoked_at IS NULL AND created_at <= $2 AND expires_at > $2`,
          [credentialId, at],
        );
        return updated.rowCount === 1 ? record : undefined;
      });
    },
  };
}
