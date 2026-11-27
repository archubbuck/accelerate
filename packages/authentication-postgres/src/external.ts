import type { Database } from "@accelerate/data-core";
import type { AuthorizationTransaction, AuthorizationTransactionStore } from "@accelerate/authentication-core/external/oauth";

/** Apply through the application's migration runner after the identity schema. */
export const externalIdentitySchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_external_identities (
    issuer text NOT NULL,
    subject text NOT NULL,
    identity_id text NOT NULL REFERENCES accelerate_identities(id) ON DELETE CASCADE,
    PRIMARY KEY (issuer, subject)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_oauth_transactions (
    transaction_key text PRIMARY KEY,
    verifier text NOT NULL,
    nonce text,
    expires_at_ms bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS accelerate_oauth_transactions_expiry_idx ON accelerate_oauth_transactions(expires_at_ms)`,
] as const;

export function createPostgresAuthorizationTransactionStore(db: Database): AuthorizationTransactionStore & {
  pruneExpired(now: number): Promise<number>;
} {
  return {
    async put(key, transaction) {
      await db.query(
        "INSERT INTO accelerate_oauth_transactions (transaction_key, verifier, nonce, expires_at_ms) VALUES ($1, $2, $3, $4)",
        [key, transaction.verifier, transaction.nonce ?? null, transaction.expiresAt],
      );
    },
    async consume(key, now) {
      const result = await db.query<{ verifier: string; nonce: string | null; expires_at_ms: string }>(
        "DELETE FROM accelerate_oauth_transactions WHERE transaction_key = $1 AND expires_at_ms > $2 RETURNING verifier, nonce, expires_at_ms",
        [key, now],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      const transaction: AuthorizationTransaction = {
        verifier: row.verifier, nonce: row.nonce ?? undefined, expiresAt: Number(row.expires_at_ms),
      };
      return transaction;
    },
    async pruneExpired(now) {
      return (await db.query("DELETE FROM accelerate_oauth_transactions WHERE expires_at_ms <= $1", [now])).rowCount;
    },
  };
}

export function createPostgresExternalIdentityLinks(db: Database) {
  return {
    async find(issuer: string, subject: string): Promise<string | undefined> {
      const result = await db.query<{ identity_id: string }>(
        "SELECT identity_id FROM accelerate_external_identities WHERE issuer = $1 AND subject = $2", [issuer, subject],
      );
      return result.rows[0]?.identity_id;
    },
    async link(issuer: string, subject: string, identityId: string): Promise<boolean> {
      return db.transaction(async tx => {
        await tx.query(
          "INSERT INTO accelerate_external_identities (issuer, subject, identity_id) VALUES ($1, $2, $3) ON CONFLICT (issuer, subject) DO NOTHING",
          [issuer, subject, identityId],
        );
        const result = await tx.query<{ identity_id: string }>(
          "SELECT identity_id FROM accelerate_external_identities WHERE issuer = $1 AND subject = $2",
          [issuer, subject],
        );
        return result.rows[0]?.identity_id === identityId;
      });
    },
  };
}
