import { expect, it, vi } from "vitest";
import { createBudgetedModelProvider, priceUsage, type BudgetStore } from "./budgets.js";

const price = { version: "v1", provider: "provider", model: "model", inputMicrosPerMillion: 1_000_000n, outputMicrosPerMillion: 2_000_000n };
const upperBound = { inputTokens: 5, outputTokens: 3 };
const request = { model: "model", messages: [] };
const now = new Date("2026-01-01T00:00:00Z");

function fixture() {
  const usage = { inputTokens: 3, outputTokens: 1 };
  const generate = vi.fn(async () => ({ content: "result", usage }));
  const store: BudgetStore = {
    reserve: vi.fn(async () => "reserved"), settle: vi.fn(), markUncertain: vi.fn(),
  };
  const provider = createBudgetedModelProvider({ generate }, {
    store, now: () => now,
    plan: () => ({ id: "attempt", budgetIds: ["scope"], upperBound, price, reservationTtlMs: 1000 }),
  });
  return { store, provider, generate, usage };
}

it("uses integer accounting and reserves before dispatch", async () => {
  const { store, provider, usage } = fixture();
  expect(priceUsage(upperBound, price)).toBe(11n);
  expect(priceUsage({ inputTokens: 1, outputTokens: 0 }, { ...price, inputMicrosPerMillion: 1n })).toBe(1n);
  await expect(provider.generate(request)).resolves.toMatchObject({ usage });
  expect(store.reserve).toHaveBeenCalledWith(expect.objectContaining({ estimateMicros: 11n, price }));
  expect(store.settle).toHaveBeenCalledWith("attempt", 5n, usage, now);
});

it("denies exhausted and duplicate attempts before calling the provider", async () => {
  const { store, provider, generate } = fixture();
  vi.mocked(store.reserve).mockResolvedValueOnce("exhausted").mockResolvedValueOnce("duplicate");
  await expect(provider.generate(request)).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
  await expect(provider.generate(request)).rejects.toMatchObject({ code: "DUPLICATE_RESERVATION" });
  expect(generate).not.toHaveBeenCalled();
});

it("preserves the reservation when a provider error leaves the charge uncertain", async () => {
  const { store, provider, generate } = fixture();
  const error = new Error("provider request failed");
  generate.mockRejectedValueOnce(error);
  await expect(provider.generate(request)).rejects.toBe(error);
  expect(store.markUncertain).toHaveBeenCalledWith("attempt", now);
  expect(store.settle).not.toHaveBeenCalled();
});
