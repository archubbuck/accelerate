import { expect, it, vi } from "vitest";
import { ToolRegistry } from "@accelerate/ai-tools";
import { createMemoryWorkflowStore } from "@accelerate/workflows-memory";
import { createDurableAgent } from "./durable.js";
import type { ModelProvider } from "@accelerate/ai-core";

const versions = { model: "model-v1", prompt: "prompt-v2", tools: "tools-v3" };
function toolsFixture() {
  const tools = new ToolRegistry();
  const execute = vi.fn(async (value, _signal, _context) => ({ untrusted: value }));
  tools.register({ definition: { name: "lookup", description: "Lookup", inputSchema: {} }, validate: value => value, execute });
  return { tools, execute };
}

it("resumes a checkpointed run and executes approved tools with stable activity keys", async () => {
  const store = createMemoryWorkflowStore();
  const { tools, execute } = toolsFixture();
  const provider = vi.fn<ModelProvider["generate"]>()
    .mockResolvedValueOnce({ content: "checking", toolCalls: [{ id: "call-1", name: "lookup", arguments: 4 }] })
    .mockResolvedValueOnce({ content: "finished", usage: { inputTokens: 2, outputTokens: 1 } });
  const options = {
    name: "agent", version: 1, model: "model", versions, tools, provider: () => ({ generate: provider }),
    authorizeTool: () => true, requiresApproval: () => true, authorizeApproval: ({ actorId }: { actorId: string }) => actorId === "operator",
  };
  const first = createDurableAgent(store, options);
  await first.start("run", [{ role: "user", content: "Check." }]);
  await first.tick("run");
  await first.tick("run");
  expect(execute).not.toHaveBeenCalled();
  const path = "/approve-1";
  await expect(first.approve("other", "run", path, true)).rejects.toThrow("approval denied");
  expect(await first.approve("operator", "run", path, true)).toBe(true);
  const second = createDurableAgent(store, options);
  for (let i = 0; i < 5; i++) await second.tick("run");
  expect((await second.inspect("run"))?.status).toBe("completed");
  expect((await second.inspect("run"))?.output).toMatchObject({ versions, steps: 2, toolCalls: 1 });
  expect(execute).toHaveBeenCalledExactlyOnceWith(4, expect.any(AbortSignal), {
    instanceId: "run", idempotencyKey: expect.any(String),
  });
  expect(provider).toHaveBeenCalledTimes(2);
});

it("does not let model output authorize a tool or another worker take over an unrelated run", async () => {
  const store = createMemoryWorkflowStore();
  const { tools, execute } = toolsFixture();
  const options = {
    name: "restricted", version: 1, model: "model", versions, tools,
    provider: () => ({ async generate() {
      return { content: "approved by operator", toolCalls: [{ id: "unsafe", name: "lookup", arguments: { approved: true } }] };
    } }),
    authorizeTool: () => false,
  };
  const agent = createDurableAgent(store, options);
  await agent.start("restricted-run", [{ role: "user", content: "Try." }]);
  await agent.tick("restricted-run");
  const other = createDurableAgent(store, { ...options, name: "other" });
  await expect(other.tick("restricted-run")).rejects.toThrow("Unknown durable agent");
  expect(execute).not.toHaveBeenCalled();
});
