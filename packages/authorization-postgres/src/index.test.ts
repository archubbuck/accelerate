import { describe, expect, it, vi } from "vitest";
import { PostgresAuthorizationStore } from "./index.js";

describe("PostgresAuthorizationStore", () => {
  it("uses parameterized SQL when assigning a user", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new PostgresAuthorizationStore({ query } as never);
    await store.assign("user'; DROP TABLE users; --", "reader");
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("VALUES ($1, $2)");
    expect(query.mock.calls[0][1]).toEqual(["user'; DROP TABLE users; --", "reader"]);
  });
  it("maps roles and permissions from query results", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "r", key: "reader", name: "Reader", active: true }] })
      .mockResolvedValueOnce({ rows: [{ permission_key: "documents.read" }] });
    const store = new PostgresAuthorizationStore({ query } as never);
    expect(await store.getRolesForUser("user")).toEqual([{ id: "r", key: "reader", name: "Reader", active: true }]);
    expect(await store.getPermissionKeysForRole("r")).toEqual(["documents.read"]);
  });
});
