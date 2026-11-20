import { describe, expect, it } from "vitest";
import { createAuthorization, definePermissions, MemoryAuthorizationStore } from "./index.js";

describe("authorization security invariants", () => {
  it("rejects whitespace-only catalog names", () => {
    expect(() => definePermissions({ " ": { read: "Read" } })).toThrow("Invalid permission resource");
    expect(() => definePermissions({ documents: { " ": "Read" } })).toThrow("Invalid permission action");
    expect(() => definePermissions({ documents: { read: null as unknown as string } })).toThrow("Permission description required");
  });

  it("rejects unregistered revocations before invoking the store", async () => {
    const permissions = definePermissions({ documents: { read: "Read" } });
    const store = new MemoryAuthorizationStore();
    const authorization = createAuthorization({ permissions, store });
    expect(() => authorization.admin.revoke("role", "documents.write" as "documents.read")).toThrow("Unregistered permission");
  });

  it("fails closed for inactive roles and unknown permissions", async () => {
    const permissions = definePermissions({ documents: { read: "Read" } });
    const store = new MemoryAuthorizationStore();
    await store.createRole({ id: "r", key: "reader", name: "Reader", active: false });
    await store.grant("r", "documents.read");
    await store.assign("user", "r");
    const authorization = createAuthorization({ permissions, store });
    expect(await authorization.can("user", "documents.read")).toBe(false);
    expect((await authorization.evaluate("user", "documents.unknown" as "documents.read")).reason).toBe("PERMISSION_UNKNOWN");
  });
});
