import type { Json } from "@accelerate/idempotency-core";
export type { Json } from "@accelerate/idempotency-core";
type Condition = { field: string; equals: Json };
export type Step = { id: string } & (
  | {
      kind: "task";
      handler: string;
      compensate?: string;
      attempts?: number;
      retryMs?: number;
      timeoutMs?: number;
      when?: Condition;
    }
  | { kind: "wait"; delayMs: number }
  | { kind: "approval"; when?: Condition }
  | { kind: "child"; definition: string; version: number }
);
export interface WorkflowDefinition {
  name: string;
  version: number;
  stages: readonly (Step | readonly Step[])[];
  concurrency?: number;
}
type Source = string | null | { [key: string]: string };
export type Node = {
  path: string;
  source: Source;
  step:
    | Exclude<Step, { kind: "child" }>
    | { id: string; kind: "join"; definition: string; version: number };
};
export interface Plan {
  name: string;
  version: number;
  concurrency: number;
  nodes: Node[];
  result: Source;
}

export function checkId(id: string) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new TypeError("Invalid workflow identifier");
}
export function count(n: number, min: number, max = 2147483647) {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new RangeError("Invalid workflow limit");
}
/** A canonical JSON snapshot independent of object key order or caller mutations. */
export function snapshot<T>(value: T): T {
  const active = new Set<object>();
  function visit(v: unknown): unknown {
    if (
      v === null ||
      typeof v === "boolean" ||
      typeof v === "string" ||
      (typeof v === "number" && Number.isFinite(v))
    )
      return v;
    if (!v || typeof v !== "object" || active.has(v))
      throw new TypeError("Expected acyclic JSON");
    active.add(v);
    let result: unknown;
    if (Array.isArray(v)) result = Array.from(v, visit);
    else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v)))
        throw new TypeError("Expected plain JSON object");
      result = Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, visit((v as Record<string, unknown>)[k])]),
      );
    }
    active.delete(v);
    return result;
  }
  return visit(value) as T;
}
export function compile(
  definitions: readonly WorkflowDefinition[],
  name: string,
  version: number,
): Plan {
  const nodes: Node[] = [];
  const registry = new Map<string, WorkflowDefinition>();
  for (const d of definitions) {
    checkId(d.name);
    count(d.version, 1);
    const key = d.name + "/" + d.version;
    if (registry.has(key)) throw Error("Duplicate workflow definition");
    registry.set(key, d);
  }
  function expand(
    key: string,
    prefix: string,
    source: Source,
    ancestors: string[],
  ): Source {
    const d = registry.get(key);
    if (!d || ancestors.includes(key))
      throw Error("Missing or cyclic workflow definition: " + key);
    const used = new Set<string>();
    for (const stage of d.stages) {
      const group = Array.isArray(stage);
      const steps: readonly Step[] = group ? stage : [stage as Step];
      if (!steps.length) throw Error("Empty parallel stage");
      const outputs: [string, string][] = [];
      for (const step of steps) {
        checkId(step.id);
        if (used.has(step.id)) throw Error("Duplicate step ID");
        used.add(step.id);
        const path = prefix + "/" + step.id;
        if (step.kind === "child") {
          const inner = expand(
            step.definition + "/" + step.version,
            path,
            source,
            [...ancestors, key],
          );
          nodes.push({
            path,
            source: inner,
            step: {
              id: step.id,
              kind: "join",
              definition: step.definition,
              version: step.version,
            },
          });
        } else {
          if (step.kind === "task") {
            checkId(step.handler);
            if (step.compensate !== undefined) checkId(step.compensate);
            count(step.attempts ?? 3, 1);
            count(step.timeoutMs ?? 30000, 1);
            count(step.retryMs ?? 0, 0);
          } else if (step.kind === "wait") count(step.delayMs, 0);
          else if (step.kind !== "approval") throw Error("Unknown step kind");
          if ("when" in step && step.when) checkId(step.when.field);
          nodes.push({ path, source, step });
        }
        outputs.push([step.id, path]);
      }
      source = group ? Object.fromEntries(outputs) : outputs[0][1];
    }
    return source;
  }
  const key = name + "/" + version;
  const result = expand(key, "", null, []);
  const concurrency = registry.get(key)!.concurrency ?? 1;
  count(concurrency, 1, 256);
  return snapshot({ name, version, concurrency, nodes, result });
}
