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
