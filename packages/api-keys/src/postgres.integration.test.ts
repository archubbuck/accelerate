import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createPostgresDatabase } from "@accelerate/data-postgres";
import { createPostgresServiceCredentialStore, serviceCredentialSchema } from "./postgres.js";
import { createServiceCredentials } from "./service.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("rotates once, persists only hashes, and attributes service credential changes", async () => {
  const schema = "service_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(await readFile(new URL("../../audit-postgres/schema.sql", import.meta.url), "utf8"));
    const db = createPostgresDatabase(pool);
    for (const statement of serviceCredentialSchema) await db.query(statement);
    let clock = new Date("2026-01-01T00:00:00Z");
    const expires = new Date(clock.getTime() + 10_000);
    const service = createServiceCredentials({
      store: createPostgresServiceCredentialStore(db),
      permissions: ["transactions.read"],
      authorize: async () => true,
      now: () => clock,
    });
    const principal = await service.createPrincipal("operator", { name: "Worker", tenantId: "tenant" });
    const key = await service.issue("operator", principal.id, ["transactions.read"], expires);
    const peer = await service.issue("operator", principal.id, ["transactions.read"], expires);
    const auth = (token: string) => service.authenticate(`Bearer ${token}`);
    expect((await auth(key.token))?.principal.id).toBe(principal.id);
    const attempts = await Promise.allSettled([
      service.rotate("operator", principal.id, key.credentialId, expires),
      service.rotate("operator", principal.id, key.credentialId, expires),
    ]);
    const winner = attempts.find(result => result.status === "fulfilled");
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    if (!winner || winner.status !== "fulfilled") throw new Error("Rotation did not succeed");
    expect(await auth(key.token)).toBeUndefined();
    expect((await auth(winner.value.token))?.credentialId).toBe(winner.value.credentialId);
    expect(await service.revoke("operator", principal.id, peer.credentialId)).toBe(true);
    expect(await auth(peer.token)).toBeUndefined();
    clock = expires;
    expect(await auth(winner.value.token)).toBeUndefined();
    const rows = await pool.query("SELECT digest, last_used_at FROM accelerate_service_credentials");
    expect(rows.rows.every(row => /^[a-f0-9]{64}$/.test(row.digest))).toBe(true);
    expect(rows.rows.some(row => row.last_used_at !== null)).toBe(true);
    const audit = await pool.query("SELECT actor_id, action FROM accelerate_audit_events ORDER BY action");
    expect(audit.rows.filter(row => row.action === "service-credential.rotate")).toEqual([
      { actor_id: "operator", action: "service-credential.rotate" },
    ]);
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
