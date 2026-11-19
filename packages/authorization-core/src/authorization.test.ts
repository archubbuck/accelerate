import { describe, expect, it } from "vitest";
import { createAuthorization, definePermissions, MemoryAuthorizationStore } from "./index.js";
describe("hybrid authorization", () => {
  const permissions = definePermissions({ users: { read: "Read users", delete: "Delete users" } });
  it("denies by default and grants through assigned roles", async () => {
    const store = new MemoryAuthorizationStore();
    const auth = createAuthorization({ permissions, store });
    expect(await auth.can("alice", "users.read")).toBe(false);
    await auth.admin.createRole({ id: "editor", key: "editor", name: "Editor", active: true });
    await auth.admin.grant("editor", "users.read");
    await auth.admin.assignRole("alice", "editor");
    expect(await auth.can("alice", "users.read")).toBe(true);
    expect(await auth.can("alice", "users.delete")).toBe(false);
    await auth.admin.removeRole("alice", "editor");
    expect(await auth.can("alice", "users.read")).toBe(false);
  });
  it("rejects unregistered permission grants", async () => {
    const auth = createAuthorization({ permissions, store: new MemoryAuthorizationStore() });
    expect(() => auth.admin.grant("role", "unknown" as "users.read")).toThrow("Unregistered");
  });
});

describe("authorization safety", () => {
  const permissions = definePermissions({ documents: { read: "Read documents", edit: "Edit documents" } });
  it("denies unknown permissions even when storage contains a grant", async () => {
    const store = new MemoryAuthorizationStore();
    await store.createRole({ id: "r", key: "reader", name: "Reader", active: true });
    await store.assign("user", "r");
    await store.grant("r", "unknown.permission");
    const auth = createAuthorization({ permissions, store });
    expect((await auth.evaluate("user", "unknown.permission" as "documents.read")).reason).toBe("PERMISSION_UNKNOWN");
  });
  it("ignores inactive roles", async () => {
    const store = new MemoryAuthorizationStore();
    await store.createRole({ id: "r", key: "disabled", name: "Disabled", active: false });
    await store.grant("r", "documents.read");
    await store.assign("user", "r");
    expect(await createAuthorization({ permissions, store }).can("user", "documents.read")).toBe(false);
  });
  it("evaluates all and any grants", async () => {
    const store = new MemoryAuthorizationStore();
    const auth = createAuthorization({ permissions, store });
    await auth.admin.createRole({ id: "r", key: "reader", name: "Reader", active: true });
    await auth.admin.grant("r", "documents.read");
    await auth.admin.assignRole("user", "r");
    expect(await auth.canAny("user", ["documents.read", "documents.edit"])).toBe(true);
    expect(await auth.canAll("user", ["documents.read", "documents.edit"])).toBe(false);
    expect(await auth.canAll("user", ["documents.read"])).toBe(true);
  });
});
