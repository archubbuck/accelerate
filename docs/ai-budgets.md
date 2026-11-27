# Persistent AI usage and budget enforcement

Use `createBudgetedModelProvider` from `@accelerate/ai/usage/budgets` and `createPostgresUsageBudgetStore` from `@accelerate/ai/usage/postgres`. Apply `usageBudgetSchema` through your migration runner.

Define a budget for each applicable scope and period. Periods use inclusive start and exclusive end timestamps. Amounts are integer microdollars. Supply a versioned price per one million input and output tokens. Persist or change versions through the application pricing configuration.

```ts
const store = createPostgresUsageBudgetStore(db);
const guard = modelProvider => createBudgetedModelProvider(modelProvider, {
  store,
  plan: request => ({
    id: createAttemptId(),
    budgetIds: [organizationBudgetId, projectBudgetId],
    upperBound: estimateMaximumUsage(request),
    price: prices.forConcreteModel(request.model),
    reservationTtlMs: 120000,
  }),
});
```

Wrap each concrete gateway route separately so primary and fallback attempts have distinct reservations with their provider, model and price version. Agents may use the guarded gateway as their model provider. Use an attempt ID that represents one actual provider invocation. A duplicate reservation is rejected before sending a request.

The store locks all applicable budget rows and commits the reservation and holds together. A successful provider result settles against the reserved price version using reported usage. If the provider charges more than the estimate, record the actual amount and reject subsequent attempts once the budget is exhausted. Admission limits reservations based on the configured estimate and provider responses. It cannot cap the provider's invoice.

A failed invocation may still incur a charge. An invocation with no reported usage retains its hold for reconciliation. Call `listExpired` to identify abandoned or uncertain entries. Reconcile them with provider records before using `settle`. Idempotent settlement protects against repeated accounting. Build metrics and dashboards around `report`, which returns held, spent and available balances for the period.
