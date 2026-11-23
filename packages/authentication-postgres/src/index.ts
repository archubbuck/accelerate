import type { Identity, IdentityStore, Session, SessionStore } from "@accelerate/authentication-core";
import type { Database } from "@accelerate/data-core";
/** Requires the schema in schema.sql; caller is responsible for migrations. */
export function createPostgresIdentityStore(db: Database): IdentityStore { return {
  async getById(id) { const r = await db.query<{ id: string; email: string | null; display_name: string | null }>("SELECT id, email, display_name FROM accelerate_identities WHERE id = $1", [id]); return toIdentity(r.rows[0]); },
  async getByEmail(email) { const r = await db.query<{ id: string; email: string | null; display_name: string | null }>("SELECT id, email, display_name FROM accelerate_identities WHERE lower(email) = lower($1)", [email]); return toIdentity(r.rows[0]); }
}; }
function toIdentity(row: { id: string; email: string | null; display_name: string | null } | undefined): Identity | undefined { return row ? { id: row.id, ...(row.email === null ? {} : { email: row.email }), ...(row.display_name === null ? {} : { displayName: row.display_name }) } : undefined; }
export function createPostgresSessionStore(db: Database): SessionStore { return {
  async get(id) { const r = await db.query<{ id: string; identity_id: string; created_at: Date; expires_at: Date }>("SELECT id, identity_id, created_at, expires_at FROM accelerate_sessions WHERE id = $1", [id]); const row = r.rows[0]; return row ? { id: row.id, identityId: row.identity_id, createdAt: row.created_at, expiresAt: row.expires_at } : undefined; },
  async put(session: Session) { await db.query("INSERT INTO accelerate_sessions (id, identity_id, created_at, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET identity_id = EXCLUDED.identity_id, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at", [session.id, session.identityId, session.createdAt, session.expiresAt]); },
  async revoke(id) { await db.query("DELETE FROM accelerate_sessions WHERE id = $1", [id]); }
}; }
