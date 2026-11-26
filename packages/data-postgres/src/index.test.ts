import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DatabaseError } from "@accelerate/data-core";
import { createPostgresDatabase } from "./index.js";

function fixture() {
  const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }),
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn().mockResolvedValue(undefined)
  };
  return { client, pool, db: createPostgresDatabase(pool as unknown as Pool) };
}

describe("PostgreSQL database adapter", () => {
  it("executes parameterized queries, validates SQL, and closes the pool", async () => {
    const { db, pool } = fixture();
    await expect(db.query<{ id: number }>("SELECT id FROM items WHERE id=$1", [1])).resolves.toEqual({ rows: [{ id: 1 }], rowCount: 1 });
    expect(pool.query).toHaveBeenCalledWith("SELECT id FROM items WHERE id=$1", [1]);
    await expect(db.query("  ")).rejects.toThrow("SQL must not be empty");
    expect(pool.query).toHaveBeenCalledTimes(1);
    await db.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("wraps query errors while preserving their causes", async () => {
    const { db, pool } = fixture();
    const cause = new Error("connection lost");
    pool.query.mockRejectedValueOnce(cause);
    await expect(db.query("SELECT 1")).rejects.toMatchObject({ name: "DatabaseError", cause });
    expect(DatabaseError.name).toBe("DatabaseError");
  });

  it("commits transactions and releases clients", async () => {
    const { db, client, pool } = fixture();
    const result = await db.transaction(async tx => {
      await tx.query("SELECT $1", [42]);
      return "ok";
    }, { isolationLevel: "serializable", readOnly: true });
    expect(result).toBe("ok");
    expect(client.query.mock.calls.map(call => call[0])).toEqual([
      "BEGIN", "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE", "SET TRANSACTION READ ONLY", "SELECT $1", "COMMIT"
    ]);
    expect(client.query.mock.calls[3][1]).toEqual([42]);
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.connect).toHaveBeenCalledOnce();
  });

  it("rolls back failed transactions and releases clients", async () => {
    const { db, client } = fixture();
    const cause = new Error("operation failed");
    await expect(db.transaction(async () => { throw cause; })).rejects.toBe(cause);
    expect(client.query.mock.calls.map(call => call[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("preserves rollback failures alongside the original error", async () => {
    const { db, client } = fixture();
    const original = new Error("operation failed");
    const rollback = new Error("rollback failed");
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockRejectedValueOnce(rollback);
    await expect(db.transaction(async () => { throw original; })).rejects.toMatchObject({
      name: "AggregateError", errors: [original, rollback]
    });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("releases clients if beginning a transaction fails", async () => {
    const { db, client } = fixture();
    const cause = new Error("begin failed");
    client.query.mockRejectedValueOnce(cause);
    await expect(db.transaction(async () => "unused")).rejects.toBe(cause);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledOnce();
  });
});

it("suspends parent access during savepoints and closes escaped executors", async () => {
  const { db, client } = fixture();
  let escaped: import("@accelerate/data-core").Transaction;
  await db.transaction(async tx => {
    escaped = tx;
    await tx.savepoint!(async child => {
      await expect(tx.query("SELECT 1")).rejects.toThrow("suspended");
      await child.query("SELECT 2");
    });
    await tx.query("SELECT 3");
  });
  await expect(escaped!.query("SELECT 4")).rejects.toThrow("closed");
  expect(client.query.mock.calls.map(c => c[0])).toEqual([
    "BEGIN", "SAVEPOINT accelerate_sp_1", "SELECT 2", "RELEASE SAVEPOINT accelerate_sp_1", "SELECT 3", "COMMIT"
  ]);
});
