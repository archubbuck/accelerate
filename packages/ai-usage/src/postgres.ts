import type { Usage } from "@accelerate/ai-core";
import type { Database, QueryExecutor } from "@accelerate/data-core";
import type { BudgetReservation, BudgetStore, VersionedPrice } from "./budgets.js";

export const usageBudgetSchema = [
  `CREATE TABLE IF NOT EXISTS accelerate_usage_budgets (
    id text PRIMARY KEY, scope text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
    limit_micros numeric(30,0) NOT NULL CHECK (limit_micros >= 0),
    held_micros numeric(30,0) NOT NULL DEFAULT 0 CHECK (held_micros >= 0),
    spent_micros numeric(30,0) NOT NULL DEFAULT 0 CHECK (spent_micros >= 0),
    CHECK (ends_at > starts_at), UNIQUE (scope, starts_at, ends_at)
  )`,
  `CREATE TABLE IF NOT EXISTS accelerate_usage_reservations (
    id text PRIMARY KEY, budget_ids text[] NOT NULL,
    estimated_micros numeric(30,0) NOT NULL CHECK (estimated_micros >= 0),
    actual_micros numeric(30,0) CHECK (actual_micros >= 0),
    state text NOT NULL CHECK (state IN ('reserved', 'uncertain', 'settled')),
    provider text NOT NULL, model text NOT NULL, price_version text NOT NULL,
    price_input numeric(30,0) NOT NULL CHECK (price_input >= 0),
    price_output numeric(30,0) NOT NULL CHECK (price_output >= 0),
    started_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    input_tokens bigint, output_tokens bigint
  )`,
  `CREATE INDEX IF NOT EXISTS accelerate_usage_reservations_expiry
    ON accelerate_usage_reservations (expires_at, id) WHERE state IN ('reserved', 'uncertain')`,
] as const;

const maxMoney = 10n ** 30n - 1n;
const validMoney = (value: bigint) => typeof value === "bigint" && value >= 0n && value <= maxMoney;
const validDate = (value: Date) => value instanceof Date && Number.isFinite(value.getTime());
const validId = (value: string) => typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value;

interface BudgetRow { id: string; limit_micros: string; held_micros: string; spent_micros: string }
interface ReservationRow {
  id: string; state: "reserved" | "uncertain" | "settled"; budget_ids: string[];
  estimated_micros: string; actual_micros: string | null; input_tokens: string | null; output_tokens: string | null;
}

function checkPrice(price: VersionedPrice) {
  if (![price.provider, price.model, price.version].every(validId)
    || !validMoney(price.inputMicrosPerMillion) || !validMoney(price.outputMicrosPerMillion)) throw new TypeError("Invalid usage price");
}

async function lockBudgets(tx: QueryExecutor, ids: readonly string[]) {
  return (await tx.query<BudgetRow>(
    "SELECT id, limit_micros, held_micros, spent_micros FROM accelerate_usage_budgets WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE",
    [ids],
  )).rows;
}

export function createPostgresUsageBudgetStore(db: Database) {
  const store: BudgetStore = {
    async reserve(input: BudgetReservation) {
      const ids = [...new Set(input.budgetIds)];
      const { id, estimateMicros, price, now, expiresAt } = input;
      if (!validId(id) || ids.length === 0 || ids.length > 16 || ids.length !== input.budgetIds.length
        || !ids.every(validId) || !validMoney(estimateMicros) || !validDate(now) || !validDate(expiresAt) || expiresAt <= now) {
        throw new TypeError("Invalid usage reservation");
      }
      checkPrice(price);
      return db.transaction(async tx => {
        const budgets = await lockBudgets(tx, ids);
        const duplicate = await tx.query("SELECT id FROM accelerate_usage_reservations WHERE id = $1", [id]);
        if (duplicate.rowCount) return "duplicate";
        const active = await tx.query(
          "SELECT id FROM accelerate_usage_budgets WHERE id = ANY($1::text[]) AND starts_at <= $2 AND ends_at > $2", [ids, now],
        );
        if (active.rowCount !== ids.length || budgets.length !== ids.length || budgets.some(row =>
          BigInt(row.held_micros) + BigInt(row.spent_micros) + estimateMicros > BigInt(row.limit_micros),
        )) return "exhausted";
        const inserted = await tx.query(
          `INSERT INTO accelerate_usage_reservations (id, budget_ids, estimated_micros, state, provider, model,
           price_version, price_input, price_output, started_at, expires_at, updated_at)
           VALUES ($1,$2,$3,'reserved',$4,$5,$6,$7,$8,$9,$10,$9) ON CONFLICT DO NOTHING`,
          [id, ids, estimateMicros.toString(), price.provider, price.model, price.version,
            price.inputMicrosPerMillion.toString(), price.outputMicrosPerMillion.toString(), now, expiresAt],
        );
        if (!inserted.rowCount) return "duplicate";
        await tx.query("UPDATE accelerate_usage_budgets SET held_micros = held_micros + $2 WHERE id = ANY($1::text[])",
          [ids, estimateMicros.toString()]);
        return "reserved";
      });
    },
    async settle(id, costMicros, usage, now) {
      const tokens = [usage?.inputTokens ?? null, usage?.outputTokens ?? null];
      if (!validId(id) || !validMoney(costMicros) || !validDate(now)
        || !tokens.every(value => value === null || (Number.isSafeInteger(value) && value >= 0))) throw new TypeError("Invalid usage settlement");
      await db.transaction(async tx => {
        const entry = (await tx.query<ReservationRow>(
          `SELECT id, state, budget_ids, estimated_micros, actual_micros, input_tokens, output_tokens
           FROM accelerate_usage_reservations WHERE id = $1 FOR UPDATE`, [id],
        )).rows[0];
        if (!entry) throw new Error("Unknown budget reservation");
        if (entry.state === "settled") {
          const same = entry.actual_micros === costMicros.toString()
            && [entry.input_tokens, entry.output_tokens].every((token, i) => token === (tokens[i]?.toString() ?? null));
          if (!same) throw new Error("Budget reservation has a different settlement");
          return;
        }
        const budgets = await lockBudgets(tx, entry.budget_ids);
        if (budgets.length !== entry.budget_ids.length) throw new Error("Budget reservation references a missing budget");
        await tx.query(
          "UPDATE accelerate_usage_budgets SET held_micros = held_micros - $2, spent_micros = spent_micros + $3 WHERE id = ANY($1::text[])",
          [entry.budget_ids, entry.estimated_micros, costMicros.toString()],
        );
        await tx.query(
          `UPDATE accelerate_usage_reservations SET state = 'settled', actual_micros = $2,
           input_tokens = $3, output_tokens = $4, updated_at = $5 WHERE id = $1`,
          [id, costMicros.toString(), ...tokens, now],
        );
      });
    },
    async markUncertain(id, now) {
      if (!validId(id) || !validDate(now)) throw new TypeError("Invalid usage reservation");
      await db.query("UPDATE accelerate_usage_reservations SET state = 'uncertain', updated_at = $2 WHERE id = $1 AND state = 'reserved'", [id, now]);
    },
  };
  return {
    ...store,
    async defineBudget(input: { id: string; scope: string; startsAt: Date; endsAt: Date; limitMicros: bigint }) {
      const { id, scope, startsAt, endsAt, limitMicros } = input;
      if (!validId(id) || !validId(scope) || !validDate(startsAt) || !validDate(endsAt)
        || endsAt <= startsAt || !validMoney(limitMicros)) throw new TypeError("Invalid budget period");
      await db.query(
        "INSERT INTO accelerate_usage_budgets (id, scope, starts_at, ends_at, limit_micros) VALUES ($1,$2,$3,$4,$5)",
        [id, scope, startsAt, endsAt, limitMicros.toString()],
      );
    },
    async report(id: string) {
      const row = (await db.query<BudgetRow>(
        "SELECT id, limit_micros, held_micros, spent_micros FROM accelerate_usage_budgets WHERE id = $1", [id],
      )).rows[0];
      if (!row) return undefined;
      const limitMicros = BigInt(row.limit_micros), heldMicros = BigInt(row.held_micros), spentMicros = BigInt(row.spent_micros);
      const remainingMicros = limitMicros - heldMicros - spentMicros;
      return { id, limitMicros, heldMicros, spentMicros, availableMicros: remainingMicros > 0n ? remainingMicros : 0n };
    },
    async listExpired(now: Date, limit = 100) {
      if (!validDate(now) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError("Invalid recovery query");
      return (await db.query<{ id: string; provider: string; model: string; price_version: string; estimated_micros: string }>(
        `SELECT id, provider, model, price_version, estimated_micros FROM accelerate_usage_reservations
         WHERE state IN ('reserved','uncertain') AND expires_at <= $1 ORDER BY expires_at, id LIMIT $2`, [now, limit],
      )).rows;
    },
  };
}
