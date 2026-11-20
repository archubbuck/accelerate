import { describe, expect, it, vi } from "vitest";
import { createAuthorization, definePermissions, MemoryAuthorizationStore } from "./index.js";

describe("authorization security invariants", () => {
  it("rejects whitespace-only catalog names", () => {
    expect(() => definePermissions({ " ": { read: "Read" } })).toThrow("Invalid permission resource");
    expect(() => definePermissions({ documents: { " ": "Read" } })).toThrow("Invalid permission action");
    expect(() => definePermissions({ documents: { read: null as unknown as string } })).toThrow("Permission description required");
  });

  it("rejects malformed roles without persisting them", async () => {
    const store = new MemoryAuthorizationStore();
    await expect(store.createRole({ id: " ", key: "reader", name: "Reader", active: true })).rejects.toThrow("Invalid role");
    await expect(store.createRole({ id: "r", key: "reader", name: "Reader", active: "yes" as unknown as boolean })).rejects.toThrow("Invalid role");
    expect(await store.getRole("r")).toBeUndefined();
  });

  it("rejects unregistered revocations before invoking the store", async () => {
    const permissions = definePermissions({ documents: { read: "Read" } });
    const store = new MemoryAuthorizationStore();
    const authorization = createAuthorization({ permissions, store });
    expect(() => authorization.admin.revoke("role", "documents.write" as "documents.read")).toThrow("Unregistered permission");
  });

  it("evaluates active role grants concurrently while preserving matched role order", async () => {
    const permissions = definePermissions({ documents: { read: "Read" } });
    const store = new MemoryAuthorizationStore();
    await store.createRole({ id: "a", key: "first", name: "First", active: true });
    await store.createRole({ id: "b", key: "second", name: "Second", active: true });
    await store.grant("a", "documents.read");
    await store.grant("b", "documents.read");
    await store.assign("user", "a");
    await store.assign("user", "b");
    const pending = new Map<string, (keys: string[]) => void>();
    const original = store.getPermissionKeysForRole.bind(store);
    const spy = vi.spyOn(store, "getPermissionKeysForRole").mockImplementation(id =>
      new Promise(resolve => pending.set(id, resolve))
    );
    const evaluation = createAuthorization({ permissions, store }).evaluate("user", "documents.read");
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    pending.get("b")!(await original("b"));
    pending.get("a")!(await original("a"));
    expect((await evaluation).matchedRoles).toEqual(["first", "second"]);
  });

  it("fails closed for inactive roles and unknown permissions", async () => {
    const permissions = definePermissions({ documents: { read: "Read" } });
    const store = new MemoryAuthorizationStore();
    await store.createRole({ id: "r", key: "reader", name: "Reader", active: false });
    await store.grant("r", "documents.read");
    await store.assign("user", "r");
    const authorization = createAuthorization({ permissions, store });
    expect(await authorization.can("user", "documents.read")).toBe(false);
    expect(await authorization.canAll("user", [])).toBe(false);
    expect((await authorization.evaluate("user", "documents.unknown" as "documents.read")).reason).toBe("PERMISSION_UNKNOWN");
  });
});
