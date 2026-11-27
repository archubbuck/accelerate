import type { Database, QueryExecutor, Transaction } from "@accelerate/data-core";
import {
  assertAccount, assertLedgerDate, assertLedgerId, assertLedgerPage, assertReversal, formatLedgerBalance,
  journalFingerprint, normalizeJournal, signedMinorUnits,
  type JournalEntry, type LedgerStore, type StoredJournal,
} from "@accelerate/data-core/ledger";

export const ledgerSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_ledger_books (book text PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS accelerate_ledger_accounts (
    book text NOT NULL REFERENCES accelerate_ledger_books(book), id text NOT NULL, currency text NOT NULL, scale integer NOT NULL CHECK (scale BETWEEN 0 AND 18),
    PRIMARY KEY (book,id), UNIQUE (book,id,currency,scale)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_ledger_journals (
    book text NOT NULL REFERENCES accelerate_ledger_books(book), id text NOT NULL,
    idempotency_key text NOT NULL, fingerprint text NOT NULL,
    sequence bigint GENERATED ALWAYS AS IDENTITY, effective_at timestamptz NOT NULL,
    reversal_of text, body jsonb NOT NULL,
    PRIMARY KEY (book,id), UNIQUE (book,idempotency_key), UNIQUE (book,reversal_of),
    FOREIGN KEY (book,reversal_of) REFERENCES accelerate_ledger_journals(book,id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS accelerate_ledger_journals_cursor ON accelerate_ledger_journals (book,sequence)`,
  `CREATE TABLE IF NOT EXISTS accelerate_ledger_lines (
    book text NOT NULL, journal_id text NOT NULL, item integer NOT NULL, account_id text NOT NULL,
    currency text NOT NULL, scale integer NOT NULL, signed_units numeric(50,0) NOT NULL CHECK (signed_units <> 0),
    PRIMARY KEY (book,journal_id,item),
    FOREIGN KEY (book,journal_id) REFERENCES accelerate_ledger_journals(book,id),
    FOREIGN KEY (book,account_id,currency,scale) REFERENCES accelerate_ledger_accounts(book,id,currency,scale)
  )`,
  `CREATE INDEX IF NOT EXISTS accelerate_ledger_lines_account ON accelerate_ledger_lines (book,account_id,journal_id)`,
] as const;

interface JournalRow { sequence: string; body: JournalEntry; fingerprint: string }
function read(row: JournalRow): StoredJournal {
  const sequence = Number(row.sequence);
  if (!Number.isSafeInteger(sequence)) throw new RangeError("Ledger sequence exceeded safe range");
  return { ...row.body, sequence };
}

export function createPostgresLedger(db: Database, book: string): LedgerStore & {
  bind(tx: Transaction): Pick<LedgerStore, "post">;
} {
  assertLedgerId(book);
  async function get(executor: QueryExecutor, id: string) {
    assertLedgerId(id);
    const row = (await executor.query<JournalRow>(
      "SELECT sequence,body,fingerprint FROM accelerate_ledger_journals WHERE book=$1 AND id=$2", [book, id],
    )).rows[0];
    return row && read(row);
  }
  async function post(tx: Transaction, input: JournalEntry) {
    const entry = normalizeJournal(input);
    const fingerprint = await journalFingerprint(entry);
    // Serialize journal writes per book so a pagination cursor never misses a late commit.
    await tx.query("SELECT book FROM accelerate_ledger_books WHERE book=$1 FOR UPDATE", [book]);
    const existing = (await tx.query<JournalRow>(
      "SELECT sequence,body,fingerprint FROM accelerate_ledger_journals WHERE book=$1 AND idempotency_key=$2", [book, entry.idempotencyKey],
    )).rows[0];
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("Conflicting ledger idempotency key");
      return read(existing);
    }
    if (entry.reversalOf) assertReversal(entry, await get(tx, entry.reversalOf));
    const { rows } = await tx.query<JournalRow>(
      `INSERT INTO accelerate_ledger_journals (book,id,idempotency_key,fingerprint,effective_at,reversal_of,body)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING sequence,body,fingerprint`,
      [book, entry.id, entry.idempotencyKey, fingerprint, entry.effectiveAt, entry.reversalOf ?? null, JSON.stringify(entry)],
    );
    await tx.query(
      `INSERT INTO accelerate_ledger_lines (book,journal_id,item,account_id,currency,scale,signed_units)
       SELECT $1,$2,pos,elem->>'account',elem->>'currency',(elem->>'scale')::integer,(elem->>'units')::numeric
       FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY AS x(elem,pos)`,
      [book, entry.id, JSON.stringify(entry.lines.map(line => ({
        account: line.accountId, currency: line.currency, scale: line.scale, units: signedMinorUnits(line).toString(),
      })))],
    );
    return read(rows[0]);
  }

  return {
    async createAccount(account) {
      assertAccount(account);
      await db.transaction(async tx => {
        await tx.query("INSERT INTO accelerate_ledger_books (book) VALUES ($1) ON CONFLICT DO NOTHING", [book]);
        await tx.query("INSERT INTO accelerate_ledger_accounts VALUES ($1,$2,$3,$4)", [book, account.id, account.currency, account.scale]);
      });
    },
    post: input => db.transaction(tx => post(tx, input)),
    bind: tx => ({ post: input => post(tx, input) }),
    get: id => get(db, id),
    async balance(accountId, through) {
      assertLedgerId(accountId);
      if (through !== undefined) assertLedgerDate(through);
      const row = (await db.query<{ units: string; scale: number }>(
        `SELECT a.scale, COALESCE(SUM(l.signed_units) FILTER (WHERE $3::timestamptz IS NULL OR j.effective_at <= $3),0) AS units
         FROM accelerate_ledger_accounts a LEFT JOIN accelerate_ledger_lines l ON l.book=a.book AND l.account_id=a.id
         LEFT JOIN accelerate_ledger_journals j ON j.book=l.book AND j.id=l.journal_id
         WHERE a.book=$1 AND a.id=$2 GROUP BY a.scale`, [book, accountId, through ?? null],
      )).rows[0];
      if (!row) throw new Error("Unknown ledger account");
      return formatLedgerBalance(BigInt(row.units), row.scale);
    },
    async page(after = 0, limit = 100) {
      assertLedgerPage(after, limit);
      return (await db.query<JournalRow>(
        "SELECT sequence,body,fingerprint FROM accelerate_ledger_journals WHERE book=$1 AND sequence>$2 ORDER BY sequence LIMIT $3",
        [book, after, limit],
      )).rows.map(read);
    },
  };
}
