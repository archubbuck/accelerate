import { describe, expect, it, vi } from "vitest";
import { PostgresAuthorizationAdmin } from "./admin.js";
import { definePermissions } from "@accelerate/authorization-core";

const permissions = definePermissions({ documents: { read: "Read documents" } });
function setup(allowed: boolean, failAudit = false) {
  const query = vi.fn(async (sql: string) => {
    if (failAudit && sql.startsWith("INSERT INTO authorization_audit_events")) throw new Error("Audit unavailable");
    return { rowCount: 1, rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const authorize = vi.fn(async () => allowed);
  return { admin: new PostgresAuthorizationAdmin({ connect } as never, permissions, { authorize }), query, release, connect, authorize };
}
describe("PostgresAuthorizationAdmin", () => {
  it("rejects malformed actor identities without invoking policy or database", async () => {
    const { admin, authorize, connect } = setup(true);
    const context = { actorId: 42 } as unknown as { actorId: string };
    await expect(admin.assign(context, "user", "role")).rejects.toThrow("Authenticated actor is required");
    await expect(admin.listAuditEvents(context)).rejects.toThrow("Forbidden");
    expect(authorize).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
  it("denies mutations before opening a connection", async () => {
    const { admin, connect } = setup(false);
    await expect(admin.grant({ actorId: "actor" }, "r", "documents.read")).rejects.toThrow("Forbidden");
    expect(connect).not.toHaveBeenCalled();
  });
  it("commits mutation and audit in one transaction", async () => {
    const { admin, query, release } = setup(true);
    await admin.assign({ actorId: "actor" }, "user", "r");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO authorization_user_roles"),
      expect.stringContaining("INSERT INTO authorization_audit_events"),
      "COMMIT"
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
  it("rolls back when audit insertion fails", async () => {
    const { admin, query, release } = setup(true, true);
    await expect(admin.grant({ actorId: "actor" }, "r", "documents.read")).rejects.toThrow("Audit unavailable");
    expect(query.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
    expect(query.mock.calls.map(([sql]) => sql)).not.toContain("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
  it("requires independent audit.read authorization", async () => {
    const { admin, authorize, connect } = setup(false);
    await expect(admin.listAuditEvents({ actorId: "actor" })).rejects.toThrow("Forbidden");
    expect(authorize).toHaveBeenCalledWith({ actorId: "actor" }, "audit.read");
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects non-finite audit limits", async () => {
    const { admin, connect } = setup(true);
    await expect(admin.listAuditEvents({ actorId: "actor" }, Infinity)).rejects.toThrow("Invalid audit limit");
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects unregistered permissions before a connection", async () => {
    const { admin, connect } = setup(true);
    await expect(admin.grant({ actorId: "actor" }, "r", "documents.write")).rejects.toThrow("Unregistered permission");
    expect(connect).not.toHaveBeenCalled();
  });
});
