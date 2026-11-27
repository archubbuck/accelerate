import type { Message, ModelProvider, ModelRequest, ToolCall, Usage } from "@accelerate/ai-core";
import type { ToolRegistry } from "@accelerate/ai-tools";
import {
  checkId, count, DurableWorkflowRunner, snapshot,
  type Activity, type ActivityContext, type Json, type Step, type WorkflowStore,
} from "@accelerate/workflows-core";

interface AgentState {
  model: string;
  messages: Message[];
  pending: ToolCall[];
  seen: string[];
  usage: Usage;
  toolCalls: number;
  steps: number;
  complete: boolean;
  hasTools: boolean;
  needsApproval: boolean;
  versions: AgentVersions;
}

interface AgentVersions {
  model: string;
  prompt: string;
  tools: string;
}

export interface DurableAgentOptions {
  name: string;
  version: number;
  model: string;
  versions: AgentVersions;
  tools: ToolRegistry;
  /** Return a budgeted provider for this durable activity, with stable attempt identity if supported. */
  provider: (context: ActivityContext) => ModelProvider;
  authorizeTool: (call: ToolCall, activity: ActivityContext) => boolean | Promise<boolean>;
  requiresApproval?: (call: ToolCall, activity: ActivityContext) => boolean | Promise<boolean>;
  authorizeApproval?: (input: { actorId: string; instanceId: string; path: string; accepted: boolean }) => boolean | Promise<boolean>;
  maxSteps?: number;
  maxCallsPerStep?: number;
  maxContextChars?: number;
  maxToolOutputChars?: number;
  timeoutMs?: number;
}

function pack(state: AgentState): Json {
  // A persisted checkpoint contains only JSON values created by trusted handlers.
  return snapshot(state) as unknown as Json;
}

function asState(input: Json): AgentState {
  return snapshot(input) as unknown as AgentState;
}

export function createDurableAgent(store: WorkflowStore, options: DurableAgentOptions) {
  checkId(options.name);
  count(options.version, 1);
  const maxSteps = options.maxSteps ?? 8;
  const maxCalls = options.maxCallsPerStep ?? 4;
  const maxContext = options.maxContextChars ?? 128 * 1024;
  const maxToolOutput = options.maxToolOutputChars ?? 32 * 1024;
  const timeoutMs = options.timeoutMs ?? 30_000;
  count(maxSteps, 1, 24);
  count(maxCalls, 0, 8);
  count(maxContext, 1, 1024 * 1024);
  count(maxToolOutput, 1, maxContext);
  count(timeoutMs, 1);
  if (!options.model.trim() || Object.values(options.versions).some(value => typeof value !== "string" || !value.trim())) {
    throw new TypeError("A durable agent must pin model, prompt and tool versions");
  }
  const versions = { ...options.versions };
  const modelHandler = "generate-v" + options.version;
  const toolHandler = "tool-v" + options.version;
  const stages: Step[] = [];
  for (let step = 1; step <= maxSteps; step++) {
    stages.push({ id: "generate-" + step, kind: "task", handler: modelHandler, when: { field: "complete", equals: false }, timeoutMs });
    if (maxCalls) {
      stages.push({ id: "approve-" + step, kind: "approval", when: { field: "needsApproval", equals: true } });
      for (let slot = 1; slot <= maxCalls; slot++) {
        stages.push({ id: "tool-" + step + "-" + slot, kind: "task", handler: toolHandler, when: { field: "hasTools", equals: true }, timeoutMs });
      }
    }
  }

  function contextWithinLimit(messages: readonly Message[]) {
    if (JSON.stringify(messages).length > maxContext) throw new RangeError("Durable agent context exceeded its limit");
  }

  const generate: Activity = async (input, activity) => {
    const state = asState(input);
    if (state.pending.length) throw new Error("Tool calls must finish before generating again");
    const request: ModelRequest = {
      model: state.model, messages: state.messages, signal: activity.signal,
      ...(maxCalls ? { tools: options.tools.definitions() } : {}),
    };
    const response = await options.provider(activity).generate(request);
    activity.signal.throwIfAborted();
    if (typeof response.content !== "string" || response.content.length > maxContext) throw new Error("Invalid model response");
    if (response.usage && ![response.usage.inputTokens, response.usage.outputTokens]
      .every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Invalid model usage");
    const calls = (response.toolCalls ?? []).map(call => ({
      id: call.id, name: call.name, arguments: snapshot(call.arguments),
    }));
    if (calls.length > maxCalls || (calls.length && state.steps + 1 === maxSteps)) throw new Error("Durable agent tool limit reached");
    const seen = new Set(state.seen);
    let needsApproval = false;
    for (const call of calls) {
      checkId(call.id);
      if (!call.name || seen.has(call.id) || !await options.authorizeTool(call, activity)) throw new Error("Agent tool call denied");
      seen.add(call.id);
      if (await options.requiresApproval?.(call, activity)) needsApproval = true;
    }
    const nextUsage = {
      inputTokens: state.usage.inputTokens + (response.usage?.inputTokens ?? 0),
      outputTokens: state.usage.outputTokens + (response.usage?.outputTokens ?? 0),
    };
    if (!Object.values(nextUsage).every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Invalid model usage");
    const messages: Message[] = [...state.messages, {
      role: "assistant", content: response.content, ...(calls.length ? { toolCalls: calls } : {}),
    }];
    contextWithinLimit(messages);
    return pack({
      ...state, messages, pending: calls, seen: [...seen], usage: nextUsage,
      steps: state.steps + 1, complete: !calls.length, hasTools: !!calls.length, needsApproval,
    });
  };

  const tool: Activity = async (input, activity) => {
    const state = asState(input);
    const [call, ...remaining] = state.pending;
    if (!call) throw new Error("Missing checkpointed tool call");
    const output = await options.tools.execute(call, candidate => options.authorizeTool(candidate, activity), activity.signal, {
      idempotencyKey: activity.idempotencyKey,
      instanceId: activity.instanceId,
    });
    const content = JSON.stringify(output) ?? "null";
    if (content.length > maxToolOutput) throw new RangeError("Durable agent tool output exceeded its limit");
    const messages: Message[] = [...state.messages, { role: "tool", content, toolCallId: call.id }];
    contextWithinLimit(messages);
    return pack({ ...state, messages, pending: remaining, hasTools: !!remaining.length, needsApproval: false, toolCalls: state.toolCalls + 1 });
  };

  const runner = new DurableWorkflowRunner(
    store, [{ name: options.name, version: options.version, stages }],
    { [modelHandler]: generate, [toolHandler]: tool },
  );
  async function inspect(id: string) {
    const instance = await runner.inspect(id);
    if (!instance || instance.plan.name !== options.name || instance.plan.version !== options.version) return undefined;
    const state = asState(instance.input);
    if (state.model !== options.model || Object.keys(versions).some(key => {
      const dimension = key as keyof AgentVersions;
      return state.versions[dimension] !== versions[dimension];
    })) {
      throw new Error("Agent worker configuration does not match the pinned versions");
    }
    return instance;
  }
  async function owned(id: string) {
    if (!await inspect(id)) throw new Error("Unknown durable agent instance");
  }
  return {
    start(id: string, messages: readonly Message[]) {
      if (messages.some(message => !["system", "user"].includes(message.role) || typeof message.content !== "string")) {
        throw new TypeError("Durable agent input must contain only application system and user messages");
      }
      const initial = messages.map(message => ({ role: message.role, content: message.content })) as Message[];
      contextWithinLimit(initial);
      return runner.start(id, options.name, options.version, pack({
        model: options.model, messages: initial, versions, pending: [], seen: [],
        usage: { inputTokens: 0, outputTokens: 0 }, toolCalls: 0,
        steps: 0, complete: false, hasTools: false, needsApproval: false,
      }));
    },
    async tick(id: string) { await owned(id); return runner.tick(id); },
    async cancel(id: string) { await owned(id); return runner.cancel(id); },
    inspect,
    async history(id: string, after?: number, limit?: number) {
      await owned(id);
      return runner.history(id, after, limit);
    },
    async approve(actorId: string, id: string, path: string, accepted: boolean) {
      if (!actorId || !await options.authorizeApproval?.({ actorId, instanceId: id, path, accepted })) {
        throw new Error("Agent approval denied");
      }
      await owned(id);
      return runner.approve(id, path, accepted);
    },
  };
}
