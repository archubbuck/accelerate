import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createAuthorization, definePermissions } from "@accelerate/authorization-core";
import { PostgresAuthorizationStore } from "./index.js";
import { PostgresAuthorizationAdmin } from "./admin.js";

const url = process.env.AUTHORIZATION_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("PostgreSQL end-to-end authorization", () => {
  const schema = "auth_test_" + randomUUID().replaceAll("-", "");
  let pool: Pool;
  const permissions = definePermissions({ documents: { read: "Read", write: "Write" } });
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url });
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
    } finally { await admin.end(); }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(readFileSync(resolve(import.meta.dirname, "../schema.sql"), "utf8"));
    await pool.query(readFileSync(resolve(import.meta.dirname, "../admin.sql"), "utf8"));
  });
  afterAll(async () => {
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: url });
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });
  it("persists grants and assignments and evaluates permissions", async () => {
    const store = new PostgresAuthorizationStore(pool);
    const auth = createAuthorization({ permissions, store });
    await auth.admin.createRole({ id: "reader", key: "reader", name: "Reader", active: true });
    await auth.admin.grant("reader", "documents.read");
    await auth.admin.assignRole("user", "reader");
    expect(await auth.can("user", "documents.read")).toBe(true);
    expect(await auth.can("user", "documents.write")).toBe(false);
    await auth.admin.revoke("reader", "documents.read");
    expect(await auth.can("user", "documents.read")).toBe(false);
  });
  it("returns assigned roles in deterministic key order", async () => {
    const store = new PostgresAuthorizationStore(pool);
    await store.createRole({ id: "z-role", key: "zulu", name: "Zulu", active: true });
    await store.createRole({ id: "a-role", key: "alpha", name: "Alpha", active: true });
    await store.assign("ordered-user", "z-role");
    await store.assign("ordered-user", "a-role");
    expect((await store.getRolesForUser("ordered-user")).map(role => role.key)).toEqual(["alpha", "zulu"]);
  });

  it("revokes access when an assigned role is deactivated", async () => {
    const store = new PostgresAuthorizationStore(pool);
    const auth = createAuthorization({ permissions, store });
    const admin = new PostgresAuthorizationAdmin(pool, permissions, { authorize: async () => true });
    await admin.createRole({ actorId: "operator" }, { id: "temporary", key: "temporary", name: "Temporary", active: true });
    await admin.grant({ actorId: "operator" }, "temporary", "documents.read");
    await admin.assign({ actorId: "operator" }, "temporary-user", "temporary");
    expect(await auth.can("temporary-user", "documents.read")).toBe(true);
    await admin.setRoleActive({ actorId: "operator" }, "temporary", false);
    expect(await auth.can("temporary-user", "documents.read")).toBe(false);
    await admin.setRoleActive({ actorId: "operator" }, "temporary", true);
    expect(await auth.can("temporary-user", "documents.read")).toBe(true);
    await admin.unassign({ actorId: "operator" }, "temporary-user", "temporary");
    expect(await auth.can("temporary-user", "documents.read")).toBe(false);
  });

  it("rolls back administrative changes when audit insertion fails", async () => {
    const admin = new PostgresAuthorizationAdmin(pool, permissions, { authorize: async () => true });
    await pool.query(`CREATE OR REPLACE FUNCTION "${schema}".reject_audit() RETURNS trigger LANGUAGE plpgsql AS $audit$ BEGIN RAISE EXCEPTION 'Audit write rejected'; END; $audit$`);
    await pool.query("CREATE TRIGGER reject_audit BEFORE INSERT ON authorization_audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit()");
    try {
      await expect(admin.createRole({ actorId: "operator" }, {
        id: "rolled-back", key: "rolled-back", name: "Rolled back", active: true
      })).rejects.toThrow("Audit write rejected");
      const result = await pool.query("SELECT id FROM authorization_roles WHERE id = $1", ["rolled-back"]);
      expect(result.rows).toHaveLength(0);
    } finally {
      await pool.query("DROP TRIGGER reject_audit ON authorization_audit_events");
      await pool.query(`DROP FUNCTION "${schema}".reject_audit()`);
    }
  });
  it("records audited mutations and enforces separate audit.read policy", async () => {
    const store = new PostgresAuthorizationStore(pool);
    await store.createRole({ id: "editor", key: "editor", name: "Editor", active: true });
    const policy = { authorize: async (_: { actorId: string }, action: string) => action !== "audit.read" };
    const admin = new PostgresAuthorizationAdmin(pool, permissions, policy);
    await admin.grant({ actorId: "operator" }, "editor", "documents.write");
    await expect(admin.listAuditEvents({ actorId: "operator" })).rejects.toThrow("Forbidden");
    const reader = new PostgresAuthorizationAdmin(pool, permissions, { authorize: async () => true });
    const events = await reader.listAuditEvents({ actorId: "auditor" });
    expect(events.some(event => event.actorId === "operator" && event.action === "permission.grant")).toBe(true);
  });
});
