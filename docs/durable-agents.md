# Durable agent execution

Use `createDurableAgent` from `@accelerate/ai/agents/durable` with the workflow store from `@accelerate/messaging/workflows/postgres` or `@accelerate/messaging/workflows/memory`. PostgreSQL workers share the existing workflow migration, claims and history. Memory storage is for tests and a single process.

Configure a trusted worker with the workflow definition version and explicit model, prompt and tool versions. Use a budgeted model provider for each activity and pass that activity's stable idempotency key when the provider supports idempotent invocation. Keep the pinned worker version available while runs still reference it.

Start with application-generated system and user messages and a unique run ID. Poll `tick(id)` from a worker queue or scheduler. Use `inspect(id)` and cursor-based `history(id, after, limit)` to observe approval, execution and terminal state. Each model response and tool result is checkpointed separately. Completed activities are skipped on restart. Pass the supplied abort signal through provider and tool I/O.

The worker's tool authorization policy is checked before a tool call can enter the plan and again immediately before execution. Configure `requiresApproval` for protected actions, and authorize an operator through `authorizeApproval` before approving the listed workflow path. Model text and tool output are untrusted data and cannot change those policies. Restrict inspection and cancellation through the application's identity and tenant controls.

The tool registry passes a stable workflow activity key to each durable tool invocation. Persist that key with any external effect. A worker can lose its checkpoint after the effect commits. A retry receives the same key, so tools that honor idempotency can return the existing result. Configure context, output and step limits for your application. Keep secrets out of persisted messages and tool results.
