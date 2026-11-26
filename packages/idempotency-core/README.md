# @accelerate/idempotency-core

Operation fingerprints, atomic claim decisions, replay and reconciliation contracts.

Use a namespaced operation key and a fingerprint of canonical input. Keep keys, tokens, results and fingerprints out of logs. A claimed decision grants permission to attempt the operation. A pending decision indicates another live claim. A conflict indicates different input. Completed and failed decisions replay their stored JSON outcome.

```ts
const decision = await store.claim({ key, fingerprint }, 30000);
if (decision.status === "claimed") {
  const result = await provider.execute(key, input);
  await store.finish(decision.claim, { status: "completed", result }, 86400000);
}
```

An abandoned claim may already have affected an external system. Verify the provider's durable outcome, then call reconcile with the abandoned claim and observed outcome. An uncertain outcome remains pending reconciliation. Exactly-once external effects require cooperation from the provider. A false finish or reconcile means the caller lost the transition. Terminal results may be replaced by a new claim after their retention period.
