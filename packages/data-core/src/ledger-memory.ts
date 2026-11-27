import {
  assertAccount, assertLedgerDate, assertLedgerId, assertLedgerPage, assertReversal, formatLedgerBalance, normalizeJournal, signedMinorUnits,
  type LedgerAccount, type LedgerStore, type StoredJournal,
} from "./ledger.js";

export function createMemoryLedger(): LedgerStore {
  const accounts = new Map<string, LedgerAccount>();
  const entries = new Map<string, StoredJournal>();
  const keys = new Map<string, StoredJournal>();
  const reversed = new Set<string>();
  return {
    async createAccount(account) {
      assertAccount(account);
      if (accounts.has(account.id)) throw new Error("Duplicate ledger account");
      accounts.set(account.id, { id: account.id, currency: account.currency, scale: account.scale });
    },
    async post(input) {
      const entry = normalizeJournal(input);
      const existing = keys.get(entry.idempotencyKey);
      if (existing) {
        const { sequence: _sequence, ...original } = existing;
        if (JSON.stringify(original) !== JSON.stringify(entry)) throw new Error("Conflicting ledger idempotency key");
        return structuredClone(existing);
      }
      if (entries.has(entry.id)) throw new Error("Duplicate ledger journal");
      for (const line of entry.lines) {
        const account = accounts.get(line.accountId);
        if (!account || line.currency !== account.currency || line.scale !== account.scale) throw new Error("Posting does not match a ledger account");
      }
      if (entry.reversalOf) {
        assertReversal(entry, entries.get(entry.reversalOf));
        if (reversed.has(entry.reversalOf)) throw new Error("Journal already reversed");
        reversed.add(entry.reversalOf);
      }
      const stored = { ...entry, sequence: entries.size + 1 };
      entries.set(stored.id, stored);
      keys.set(stored.idempotencyKey, stored);
      return structuredClone(stored);
    },
    async get(id) { assertLedgerId(id); return structuredClone(entries.get(id)); },
    async balance(accountId, through) {
      const account = accounts.get(accountId);
      if (!account) throw new Error("Unknown ledger account");
      if (through !== undefined) assertLedgerDate(through);
      let units = 0n;
      for (const entry of entries.values()) {
        if (through !== undefined && entry.effectiveAt > through) continue;
        for (const line of entry.lines) if (line.accountId === accountId) units += signedMinorUnits(line);
      }
      return formatLedgerBalance(units, account.scale);
    },
    async page(after = 0, limit = 100) {
      assertLedgerPage(after, limit);
      return structuredClone([...entries.values()].slice(after, after + limit));
    },
  };
}
