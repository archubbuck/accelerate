import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createPostgresDatabase } from "@accelerate/data-postgres";
import { auditIntegritySchema, createPostgresIntegrityAuditStore, createPostgresAuditRetention } from "./integrity.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("serializes appends and verifies rollback, retention and tamper detection", async () => {
  const schema = "integrity_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of auditIntegritySchema) await db.query(statement);
    const audit = createPostgresIntegrityAuditStore(db);
    const event = (id: string) => ({
      id, occurredAt: new Date("2026-01-01T00:00:00Z"), action: "saved", resource: "order", outcome: "success" as const,
    });
    await expect(db.transaction(async tx => {
      await audit.bind(tx).append("orders", event("rollback"));
      throw new Error("reject write");
    })).rejects.toThrow("reject write");
    expect((await audit.checkpoint("orders")).sequence).toBe(0);
    await Promise.all(Array.from({ length: 8 }, (_, n) => audit.append("orders", event(String(n)))));
    const records = await audit.page("orders", { limit: 3, action: "saved" });
    expect(records.map(row => row.sequence)).toEqual([1, 2, 3]);
    const next = await audit.page("orders", { after: 3, limit: 2, resource: "order" });
    expect(next.map(row => row.sequence)).toEqual([4, 5]);
    expect(await audit.verify("orders", records[1])).toMatchObject({ ok: true, head: { sequence: 8 } });
    const retention = createPostgresAuditRetention(db);
    expect(await retention.prune(records[1])).toBe(2);
    await expect(audit.append("orders", event(records[0].event.id))).rejects.toThrow();
    expect(await audit.verify("orders", records[1])).toMatchObject({ ok: true, head: { sequence: 8 } });
    await db.query(
      "UPDATE accelerate_audit_chain_events SET payload = jsonb_set(payload, '{action}', to_jsonb($3::text)) WHERE stream = $1 AND sequence = $2",
      ["orders", 4, "changed"],
    );
    expect(await audit.verify("orders", records[1])).toEqual({ ok: false, sequence: 4, reason: "CHAIN" });
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
