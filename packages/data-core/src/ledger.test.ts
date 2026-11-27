import { expect, it } from "vitest";
import { reconcileLedger, reverseJournal, type JournalEntry } from "./ledger.js";
import { createMemoryLedger } from "./ledger-memory.js";

const at = "2026-01-01T00:00:00.000Z";
const next = "2026-01-02T00:00:00.000Z";
const entry: JournalEntry = {
  id: "entry", idempotencyKey: "operation", effectiveAt: at,
  lines: [
    { accountId: "asset", side: "debit", amount: "9007199254740993.01", currency: "USD", scale: 2 },
    { accountId: "income", side: "credit", amount: "9007199254740993.01", currency: "USD", scale: 2 },
  ],
};

it("keeps exact historical balances, rejects unbalanced posts and makes reversals immutable", async () => {
  const ledger = createMemoryLedger();
  for (const id of ["asset", "income"]) await ledger.createAccount({ id, scale: 2, currency: "USD" });
  await expect(ledger.post({ ...entry, lines: [entry.lines[0], { ...entry.lines[1], amount: "2.00" }] }))
    .rejects.toThrow("Unbalanced");
  const posted = await ledger.post(entry);
  expect(await ledger.post(entry)).toEqual(posted);
  await expect(ledger.post({ ...entry, reference: "changed" })).rejects.toThrow("Conflicting");
  expect(await ledger.balance("asset")).toBe("9007199254740993.01");
  const reversal = reverseJournal(entry, { id: "reversal", idempotencyKey: "reverse-once", effectiveAt: next });
  await ledger.post(reversal);
  expect(await ledger.get(entry.id)).toEqual(posted);
  expect(await ledger.balance("asset", at)).toBe("9007199254740993.01");
  expect(await ledger.balance("asset")).toBe("0.00");
  expect(await ledger.page(1, 1)).toEqual([expect.objectContaining({ id: "reversal" })]);
  expect(await reconcileLedger(ledger, [{ accountId: "asset", expected: "0.00" }]))
    .toEqual([{ accountId: "asset", expected: "0.00", actual: "0.00", matches: true }]);
});
