import type { ModelProvider, ModelRequest, Usage } from "@accelerate/ai-core";

export interface VersionedPrice {
  version: string;
  provider: string;
  model: string;
  inputMicrosPerMillion: bigint;
  outputMicrosPerMillion: bigint;
}

export interface BudgetReservation {
  id: string;
  budgetIds: readonly string[];
  estimateMicros: bigint;
  price: VersionedPrice;
  now: Date;
  expiresAt: Date;
}

export interface BudgetStore {
  reserve(reservation: BudgetReservation): Promise<"reserved" | "exhausted" | "duplicate">;
  settle(id: string, costMicros: bigint, usage: Usage | undefined, now: Date): Promise<void>;
  markUncertain(id: string, now: Date): Promise<void>;
}

export class UsageBudgetError extends Error {
  constructor(readonly code: "BUDGET_EXHAUSTED" | "DUPLICATE_RESERVATION") {
    super(code === "BUDGET_EXHAUSTED" ? "Model usage budget exhausted" : "Model usage reservation already exists");
    this.name = "UsageBudgetError";
  }
}

export function priceUsage(usage: Usage, price: VersionedPrice): bigint {
  if (![usage.inputTokens, usage.outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)
    || price.inputMicrosPerMillion < 0n || price.outputMicrosPerMillion < 0n) {
    throw new RangeError("Invalid token count or usage price");
  }
  const units = BigInt(usage.inputTokens) * price.inputMicrosPerMillion + BigInt(usage.outputTokens) * price.outputMicrosPerMillion;
  return (units + 999_999n) / 1_000_000n;
}

/** Wrap each concrete route separately so fallback attempts have separate reservations. */
export function createBudgetedModelProvider(
  provider: ModelProvider,
  options: {
    store: BudgetStore;
    plan: (request: ModelRequest) => {
      id: string; budgetIds: readonly string[]; upperBound: Usage; price: VersionedPrice; reservationTtlMs: number;
    } | Promise<{
      id: string; budgetIds: readonly string[]; upperBound: Usage; price: VersionedPrice; reservationTtlMs: number;
    }>;
    now?: () => Date;
  },
): ModelProvider {
  const now = options.now ?? (() => new Date());
  return {
    supportsStructuredOutput: provider.supportsStructuredOutput?.bind(provider),
    async generate(request) {
      request.signal?.throwIfAborted();
      const plan = await options.plan(request);
      if (!Number.isSafeInteger(plan.reservationTtlMs) || plan.reservationTtlMs <= 0) throw new RangeError("Invalid reservation lifetime");
      const started = now();
      const price = { ...plan.price };
      request.signal?.throwIfAborted();
      const result = await options.store.reserve({
        id: plan.id, budgetIds: [...plan.budgetIds], price, estimateMicros: priceUsage(plan.upperBound, price),
        now: started, expiresAt: new Date(started.getTime() + plan.reservationTtlMs),
      });
      if (result !== "reserved") throw new UsageBudgetError(result === "duplicate" ? "DUPLICATE_RESERVATION" : "BUDGET_EXHAUSTED");
      if (request.signal?.aborted) {
        await options.store.settle(plan.id, 0n, undefined, now());
        request.signal.throwIfAborted();
      }
      let response;
      try { response = await provider.generate(request); }
      catch (error) {
        // A failed request may have reached the provider and incurred a charge.
        await options.store.markUncertain(plan.id, now());
        throw error;
      }
      if (!response.usage) await options.store.markUncertain(plan.id, now());
      else {
        let actual: bigint;
        try { actual = priceUsage(response.usage, price); }
        catch (error) {
          await options.store.markUncertain(plan.id, now());
          throw error;
        }
        await options.store.settle(plan.id, actual, response.usage, now());
      }
      return response;
    },
  };
}
