import { describe, it, expect } from "vitest";
import { postgresFixture, databaseUrl } from "../../../tools/testing/wave7-postgres";
import { composeTransaction } from "../../transactions/dist/index.js";
import type { QueryExecutor, Transaction } from "@accelerate/data-core";

describe.skipIf(!databaseUrl)("transaction composition on PostgreSQL", () => {
  const { database } = postgresFixture();
  const repository = (tx: QueryExecutor) => ({
    insert: (id: number) => tx.query("INSERT INTO composition VALUES ($1)", [id])
  });
  it("rolls back collaborating repositories and supports partial savepoint rollback", async () => {
    await database.query("CREATE TABLE composition (id integer PRIMARY KEY)");
    await expect(composeTransaction(database, async context => {
      await context.bind(repository).insert(1);
      await context.bind(repository).insert(2);
      throw Error("abort");
    })).rejects.toThrow("abort");
    expect((await database.query("SELECT * FROM composition")).rowCount).toBe(0);
    let child: Transaction;
    await composeTransaction(database, async context => {
      await context.bind(repository).insert(1);
      await expect(context.executor.savepoint!(async tx => {
        child = tx;
        await repository(tx).insert(2);
        await repository(tx).insert(1);
      })).rejects.toThrow();
      await expect(child!.query("SELECT 1")).rejects.toThrow();
      await context.bind(repository).insert(3);
    });
    expect((await database.query("SELECT id FROM composition ORDER BY id")).rows).toEqual([{id:1},{id:3}]);
  });
  it("applies requested isolation and read-only options", async () => {
    await database.transaction(async tx => {
      expect((await tx.query("SHOW transaction_isolation")).rows[0]).toEqual({transaction_isolation:"serializable"});
      expect((await tx.query("SHOW transaction_read_only")).rows[0]).toEqual({transaction_read_only:"on"});
      await expect(tx.query("CREATE TABLE forbidden (id int)")).rejects.toThrow();
      throw Error("rollback read-only transaction");
    }, { isolationLevel:"serializable", readOnly:true }).catch(error => {
      expect(error.message).toBe("rollback read-only transaction");
    });
  });
});
