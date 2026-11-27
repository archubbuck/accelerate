import type { Message, ModelProvider, ModelRequest, ModelResponse, NativeStructuredOutput, Usage } from "@accelerate/ai-core";
import type { Schema, ValidationIssue } from "@accelerate/validation-core";

type Failure = "INVALID_JSON" | "SCHEMA_MISMATCH" | "OUTPUT_TOO_LARGE" | "UNEXPECTED_TOOL_CALL";

export interface StructuredAttempt {
  content?: string;
  mode: "native" | "prompt";
  usage?: Usage;
  costMicros?: bigint;
  failure?: Failure;
}

export class StructuredOutputError extends Error {
  #attempts: readonly StructuredAttempt[];
  constructor(readonly code: Failure, readonly schemaVersion: string, attempts: readonly StructuredAttempt[]) {
    super("Model output did not match the requested structure");
    this.name = "StructuredOutputError";
    this.#attempts = attempts;
  }
  get attempts() { return this.#attempts; }
}

type Parsed<T> = { ok: true; data: T } | { ok: false; failure: Failure; issues?: readonly ValidationIssue[] };

function parseAttempt<T>(response: ModelResponse, schema: Schema<T>, maxChars: number): Parsed<T> {
  if (response.toolCalls?.length) return { ok: false, failure: "UNEXPECTED_TOOL_CALL" };
  if (response.content.length > maxChars) return { ok: false, failure: "OUTPUT_TOO_LARGE" };
  let input: unknown;
  try { input = JSON.parse(response.content); }
  catch { return { ok: false, failure: "INVALID_JSON" }; }
  const result = schema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : { ok: false, failure: "SCHEMA_MISMATCH", issues: result.issues };
}

function safeFeedback(failure: Failure, issues: readonly ValidationIssue[] = []): string {
  const paths = issues.slice(0, 12).map(issue => issue.path.slice(0, 16).map(segment =>
    typeof segment === "number" || /^[A-Za-z0-9_-]{1,48}$/.test(segment) ? segment : "?",
  ));
  return "Return only valid JSON matching the schema. Correct the previous error: " + JSON.stringify({ failure, paths });
}

export async function generateStructured<T>(
  provider: ModelProvider,
  request: ModelRequest,
  options: {
    schema: Schema<T>;
    output: NativeStructuredOutput;
    maxRepairs?: number;
    maxOutputChars?: number;
    repairFeedback?: (failure: Failure, issues: readonly ValidationIssue[]) => string | undefined;
    estimateCostMicros?: (usage: Usage, response: ModelResponse) => bigint;
  },
) {
  const { output, schema } = options;
  const maxRepairs = options.maxRepairs ?? 1;
  const maxOutputChars = options.maxOutputChars ?? 64 * 1024;
  if (!Number.isSafeInteger(maxRepairs) || maxRepairs < 0 || maxRepairs > 5
    || !Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1
    || !output.schemaId.trim() || !output.schemaVersion.trim()) throw new RangeError("Invalid structured generation options");
  const json = JSON.stringify(output.jsonSchema);
  if (!json || json.length > 64 * 1024) throw new RangeError("Invalid structured output JSON Schema");
  const format = { ...output, jsonSchema: JSON.parse(json) as NativeStructuredOutput["jsonSchema"] };
  const messages: Message[] = [
    { role: "system", content: "Return JSON and no other text. Use this JSON Schema: " + json },
    ...request.messages,
  ];
  const { tools: omittedTools, structuredOutput: omittedFormat, ...base } = request;
  request.signal?.throwIfAborted();
  const native = await provider.supportsStructuredOutput?.(request.model);
  const attempts: StructuredAttempt[] = [];
  let failure: Failure = "INVALID_JSON";
  let inputTokens = 0, outputTokens = 0, estimatedCostMicros = 0n, attemptsWithoutUsage = 0;
  for (let index = 0; index <= maxRepairs; index++) {
    request.signal?.throwIfAborted();
    const response = await provider.generate({ ...base, messages: [...messages], ...(native ? { structuredOutput: format } : {}) });
    request.signal?.throwIfAborted();
    const parsed = parseAttempt(response, schema, maxOutputChars);
    const usage = response.usage;
    if (usage) {
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
    } else attemptsWithoutUsage++;
    const costMicros = usage && options.estimateCostMicros?.(usage, response);
    estimatedCostMicros += costMicros ?? 0n;
    const content = response.content.length <= maxOutputChars ? response.content : undefined;
    attempts.push({
      content, mode: response.structuredOutputMode ?? (native ? "native" : "prompt"),
      usage, costMicros, ...(parsed.ok ? {} : { failure: parsed.failure }),
    });
    if (parsed.ok) {
      return {
        data: parsed.data, schemaId: output.schemaId, schemaVersion: output.schemaVersion,
        attempts, usage: { inputTokens, outputTokens }, attemptsWithoutUsage,
        ...(options.estimateCostMicros ? { estimatedCostMicros } : {}),
      };
    }
    failure = parsed.failure;
    if (index >= maxRepairs) break;
    const feedback = options.repairFeedback
      ? options.repairFeedback(failure, parsed.issues ?? [])
      : safeFeedback(failure, parsed.issues);
    if (!feedback) break;
    if (content && failure !== "UNEXPECTED_TOOL_CALL") messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: feedback });
  }
  throw new StructuredOutputError(failure, output.schemaVersion, attempts);
}
