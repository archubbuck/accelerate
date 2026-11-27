import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { reverseJournal, type JournalEntry } from "@accelerate/data-core/ledger";
import { createPostgresDatabase } from "./index.js";
import { createPostgresLedger, ledgerSchema } from "./ledger.js";

const connectionString = process.env.WAVE7_TEST_DATABASE_URL;
it.skipIf(!connectionString)("posts concurrently without duplicating balances and rolls back bound journals", async () => {
  const schema = "ledger_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = createPostgresDatabase(pool);
    for (const statement of ledgerSchema) await db.query(statement);
    const ledger = createPostgresLedger(db, "main");
    for (const id of ["asset", "income"]) await ledger.createAccount({ id, currency: "USD", scale: 2 });
    const at = "2026-01-01T00:00:00.000Z";
    const entry: JournalEntry = {
      id: "entry", idempotencyKey: "operation", effectiveAt: at,
      lines: [
        { accountId: "asset", side: "debit", amount: "9007199254740993.40", currency: "USD", scale: 2 },
        { accountId: "income", side: "credit", amount: "9007199254740993.40", currency: "USD", scale: 2 },
      ],
    };
    const [left, right] = await Promise.all([ledger.post(entry), ledger.post(entry)]);
    expect(left).toEqual(right);
    expect(await ledger.balance("asset")).toBe("9007199254740993.40");
    await expect(db.transaction(async tx => {
      await ledger.bind(tx).post({ ...entry, id: "rollback", idempotencyKey: "rollback" });
      throw new Error("reject business write");
    })).rejects.toThrow("reject business write");
    expect(await ledger.get("rollback")).toBeUndefined();
    await ledger.post(reverseJournal(left, { id: "reversal", idempotencyKey: "reverse", effectiveAt: "2026-01-02T00:00:00.000Z" }));
    expect(await ledger.balance("asset")).toBe("0.00");
    expect(await ledger.balance("income", at)).toBe("-9007199254740993.40");
    expect((await ledger.page(left.sequence, 1))[0].id).toBe("reversal");
  } finally {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}, 15000);
