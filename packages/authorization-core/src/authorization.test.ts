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
