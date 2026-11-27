import type { ToolCall, ToolDefinition } from "@accelerate/ai-core";

export interface DurableToolContext {
  readonly idempotencyKey: string;
  readonly instanceId: string;
}

export interface RegisteredTool {
  readonly definition: ToolDefinition;
  validate(input: unknown): unknown;
  execute(input: unknown, signal?: AbortSignal, durable?: DurableToolContext): Promise<unknown>;
}

export type ToolAuthorization = (call: ToolCall) => boolean | Promise<boolean>;

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    if (!tool.definition.name || this.tools.has(tool.definition.name)) throw new Error("Invalid or duplicate tool");
    this.tools.set(tool.definition.name, tool);
  }

  definitions(): readonly ToolDefinition[] {
    return [...this.tools.values()].map(tool => tool.definition);
  }

  async execute(call: ToolCall, authorize: ToolAuthorization, signal?: AbortSignal, durable?: DurableToolContext): Promise<unknown> {
    signal?.throwIfAborted();
    const tool = this.tools.get(call.name);
    if (!tool) throw new Error("Unknown tool");
    if (!await authorize(call)) throw new Error("Tool execution denied");
    signal?.throwIfAborted();
    const args = tool.validate(call.arguments);
    return durable ? tool.execute(args, signal, durable) : tool.execute(args, signal);
  }
}
