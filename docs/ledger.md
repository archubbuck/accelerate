# Double-entry ledger

Use `@accelerate/data/ledger` for journal contracts, `@accelerate/data/ledger/postgres` for a persistent ledger, and `@accelerate/data/ledger/memory` for deterministic tests. Apply `ledgerSchema` through the application's migration runner.

Create accounts with an explicit denomination and scale. Pass positive amounts as decimal strings at the account's exact scale and identify each line as a debit or credit. Entries must balance independently for every denomination. The implementation checks balance in integer minor units and PostgreSQL stores those units exactly. A returned balance uses debit-positive and credit-negative convention.

```ts
const ledger = createPostgresLedger(db, 'billing');
await ledger.createAccount({ id: 'cash', currency: 'USD', scale: 2 });
await ledger.createAccount({ id: 'revenue', currency: 'USD', scale: 2 });
await db.transaction(async transaction => {
  await persistPayment(transaction, payment);
  await ledger.bind(transaction).post({
    id: payment.id, idempotencyKey: payment.operationId, effectiveAt: payment.effectiveAt,
    lines: [
      { accountId: 'cash', side: 'debit', amount: '25.00', currency: 'USD', scale: 2 },
      { accountId: 'revenue', side: 'credit', amount: '25.00', currency: 'USD', scale: 2 },
    ],
  });
});
```

Retry the same normalized journal with the same idempotency key. A changed request with the same key fails. Reverse rather than editing a journal using `reverseJournal` and a fresh ID and key. The original journal remains readable. The store serializes writes per book and enforces unique journal IDs, idempotency keys, and reversal links. Restrict direct table writes to the ledger adapter to preserve application-level balance validation.

Use `balance(accountId, through)` for account balances by effective time and `page(after, limit)` with the last returned sequence for stable pagination. Use `reconcileLedger` to compare balances against control totals. Choose a closed cutoff for reconciliation or run the reads from a stable database snapshot when concurrent adjustments are possible.
