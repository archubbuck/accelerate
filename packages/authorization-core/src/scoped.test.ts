import { expect, it, vi } from "vitest";
import { definePermissions } from "./index.js";
import { createScopedAuthorization, ownerOnlyPolicy, type GrantScope, type ScopedGrantStore } from "./scoped.js";

const permissions = definePermissions({ documents: { read: "Read", write: "Write" } });
const resource = (resourceId = "one", tenantId = "acme"): GrantScope => ({
  kind: "resource", tenantId, resourceType: "document", resourceId,
});
const subject = { id: "reader", tenantId: "acme" };

it("keeps global, tenant and resource assignments isolated", async () => {
  const grants = vi.fn<ScopedGrantStore["findGrants"]>().mockResolvedValue([
    { roleKey: "reader", scope: resource() },
    { roleKey: "global", scope: { kind: "global" } },
    { roleKey: "other tenant", scope: { kind: "tenant", tenantId: "other" } },
  ]);
  const authorization = createScopedAuthorization({ permissions, store: { findGrants: grants, changeAssignment: vi.fn() } });
  expect(await authorization.evaluate({ subject, scope: resource("one", "other") }, "documents.read")).toMatchObject({ reason: "CROSS_TENANT" });
  expect(grants).not.toHaveBeenCalled();
  expect(await authorization.evaluate({ subject, scope: resource() }, "documents.read")).toMatchObject({ allowed: true, matchedRoles: ["reader"] });
  expect(await authorization.can({ subject, scope: resource("two") }, "documents.read")).toBe(false);
  expect(await authorization.can({ subject: { id: subject.id }, scope: { kind: "global" } }, "documents.read")).toBe(true);
  expect(await authorization.evaluate({ subject, scope: { ...resource(), resourceId: " " } as GrantScope }, "documents.read")).toMatchObject({ reason: "INVALID_CONTEXT" });
});

it("requires grants and honors policy denials after earlier allows", async () => {
  const authorization = createScopedAuthorization({
    permissions,
    store: { findGrants: async () => [{ roleKey: "tenant writer", scope: { kind: "tenant", tenantId: "acme" } }], changeAssignment: vi.fn() },
    policies: [{ id: "prior allow", check: () => "allow" }, ownerOnlyPolicy("owner", ["documents.write"])],
  });
  expect(await authorization.evaluate({ subject, scope: resource(), ownerId: "another" }, "documents.write")).toMatchObject({ deniedBy: "owner" });
  expect(await authorization.can({ subject, scope: resource(), ownerId: subject.id }, "documents.write")).toBe(true);
});

it("delegates only authorized admin changes with actor attribution", async () => {
  const changeAssignment = vi.fn().mockResolvedValue(true);
  const authorization = createScopedAuthorization({
    permissions, store: { findGrants: async () => [], changeAssignment },
    authorizeAssignment: async actor => actor.id === "operator",
  });
  const assignment = { userId: "reader", roleId: "reader-role", scope: resource() };
  await expect(authorization.changeRole(subject, "assign", assignment)).rejects.toThrow("not authorized");
  await expect(authorization.changeRole({ id: "operator", tenantId: "other" }, "assign", assignment)).rejects.toThrow("not authorized");
  await expect(authorization.changeRole({ id: "operator", tenantId: "acme" }, "assign", assignment)).resolves.toBe(true);
  expect(changeAssignment).toHaveBeenCalledExactlyOnceWith({ action: "assign", actorId: "operator", assignment });
});
