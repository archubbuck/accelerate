import { artifactSha256 } from "./provenance.js";

export interface LedgerAccount {
  id: string;
  currency: string;
  scale: number;
}

export interface LedgerLine {
  accountId: string;
  side: "debit" | "credit";
  amount: string;
  currency: string;
  scale: number;
}

export interface JournalEntry {
  id: string;
  idempotencyKey: string;
  effectiveAt: string;
  lines: readonly LedgerLine[];
  reversalOf?: string;
  reference?: string;
}

export interface StoredJournal extends JournalEntry {
  sequence: number;
}

export interface LedgerStore {
  createAccount(account: LedgerAccount): Promise<void>;
  post(entry: JournalEntry): Promise<StoredJournal>;
  get(id: string): Promise<StoredJournal | undefined>;
  balance(accountId: string, through?: string): Promise<string>;
  page(after?: number, limit?: number): Promise<readonly StoredJournal[]>;
}

export function assertLedgerId(id: string) {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(id)) throw new TypeError("Invalid ledger identifier");
}

export function assertLedgerDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError("Expected an ISO UTC date");
}

export function assertAccount(account: LedgerAccount) {
  assertLedgerId(account.id);
  if (!/^[A-Z][A-Z0-9]{1,11}$/.test(account.currency)
    || !Number.isSafeInteger(account.scale) || account.scale < 0 || account.scale > 18) throw new TypeError("Invalid account denomination");
}

export function signedMinorUnits(line: LedgerLine): bigint {
  assertAccount({ id: line.accountId, currency: line.currency, scale: line.scale });
  if (line.side !== "debit" && line.side !== "credit") throw new TypeError("Invalid ledger side");
  if (typeof line.amount !== "string" || line.amount.length > 49
    || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(line.amount)) throw new TypeError("Invalid positive ledger amount");
  const [whole, fraction = ""] = line.amount.split(".");
  if (fraction.length !== line.scale) throw new TypeError("Ledger amount must match the account scale");
  const units = BigInt(whole + fraction);
  if (units <= 0n) throw new TypeError("Invalid positive ledger amount");
  return line.side === "debit" ? units : -units;
}

export function formatLedgerBalance(units: bigint, scale: number): string {
  const sign = units < 0n ? "-" : "";
  const digits = (units < 0n ? -units : units).toString().padStart(scale + 1, "0");
  return scale === 0 ? sign + digits : sign + digits.slice(0, -scale) + "." + digits.slice(-scale);
}

export function normalizeJournal(entry: JournalEntry): JournalEntry {
  assertLedgerId(entry.id);
  assertLedgerId(entry.idempotencyKey);
  assertLedgerDate(entry.effectiveAt);
  if (entry.reversalOf !== undefined) assertLedgerId(entry.reversalOf);
  if (entry.reference !== undefined && (typeof entry.reference !== "string" || entry.reference.length > 1024)) throw new TypeError("Invalid journal reference");
  if (!Array.isArray(entry.lines) || entry.lines.length < 2 || entry.lines.length > 1000) throw new RangeError("Invalid posting count");
  const totals = new Map<string, bigint>();
  const lines = entry.lines.map(({ accountId, side, amount, currency, scale }) => {
    const line = { accountId, side, amount, currency, scale };
    const denomination = currency + ":" + scale;
    totals.set(denomination, (totals.get(denomination) ?? 0n) + signedMinorUnits(line));
    return line;
  });
  if ([...totals.values()].some(total => total !== 0n)) throw new Error("Unbalanced journal entry");
  return { id: entry.id, idempotencyKey: entry.idempotencyKey, effectiveAt: entry.effectiveAt, lines, reversalOf: entry.reversalOf, reference: entry.reference };
}

export function journalFingerprint(entry: JournalEntry) {
  return artifactSha256(JSON.stringify(normalizeJournal(entry)));
}

export function reverseJournal(original: JournalEntry, input: Pick<JournalEntry, "id" | "idempotencyKey" | "effectiveAt" | "reference">): JournalEntry {
  return { ...input, reversalOf: original.id, lines: original.lines.map(line => ({
    ...line, side: line.side === "debit" ? "credit" : "debit",
  })) };
}

export function assertReversal(entry: JournalEntry, original: JournalEntry | undefined) {
  if (!original || original.reversalOf || entry.effectiveAt < original.effectiveAt
    || JSON.stringify(entry.lines) !== JSON.stringify(normalizeJournal(reverseJournal(original, entry)).lines)) {
    throw new TypeError("Reversal must exactly offset the original journal");
  }
}

export function assertLedgerPage(after: number, limit: number) {
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError("Invalid ledger page");
  }
}

export async function reconcileLedger(ledger: LedgerStore, control: readonly { accountId: string; expected: string }[], through?: string) {
  return Promise.all(control.map(async ({ accountId, expected }) => {
    const actual = await ledger.balance(accountId, through);
    return { accountId, expected, actual, matches: expected === actual };
  }));
}
