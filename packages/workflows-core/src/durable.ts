import {
  checkId,
  compile,
  count,
  snapshot,
  type Json,
  type Node,
  type Plan,
  type WorkflowDefinition,
} from "./definition.js";
export * from "./definition.js";

type Status =
  | "running"
  | "unwinding"
  | "completed"
  | "failed"
  | "cancelled"
  | "compensation-failed";
type Phase =
  | "pending"
  | "ready"
  | "active"
  | "done"
  | "skipped"
  | "waiting"
  | "approval"
  | "undoing"
  | "undone"
  | "failed";
interface Progress {
  phase: Phase;
  attempt: number;
  input?: Json;
  output?: Json;
  at?: number;
  token?: string;
}
export interface Instance {
  id: string;
  plan: Plan;
  input: Json;
  status: Status;
  steps: Record<string, Progress>;
  completed: string[];
  reason?: "failed" | "cancelled";
  output?: Json;
}
export interface WorkflowEvent {
  at: number;
  type: string;
  path?: string;
  attempt?: number;
}
export interface WorkflowStore {
  create(instance: Instance): Promise<boolean>;
  get(id: string): Promise<Instance | undefined>;
  /** Serialize callbacks per instance and atomically commit the instance and emitted events. */
  update<T>(
    id: string,
    fn: (
      state: Instance,
      now: number,
      emit: (event: WorkflowEvent) => void,
    ) => T,
  ): Promise<T>;
  history(
    id: string,
    after?: number,
    limit?: number,
  ): Promise<Array<WorkflowEvent & { cursor: number }>>;
}
export interface ActivityContext {
  instanceId: string;
  path: string;
  attempt: number;
  idempotencyKey: string;
  signal: AbortSignal;
}
export type Activity = (input: Json, ctx: ActivityContext) => Promise<Json>;
interface Work {
  path: string;
  token: string;
  attempt: number;
  handler: string;
  input: Json;
  timeout: number;
  undo: boolean;
}
function read(s: Instance, source: Node["source"]): Json | undefined {
  if (source === null) return s.input;
  if (typeof source === "string") {
    const p = s.steps[source];
    return p.phase === "done" || p.phase === "skipped" ? p.output : undefined;
  }
  const entries = Object.entries(source).map(
    ([key, path]) => [key, read(s, path)] as const,
  );
  return entries.some(([, value]) => value === undefined)
    ? undefined
    : (Object.fromEntries(entries) as Json);
}
function stop(s: Instance, reason: "cancelled" | "failed") {
  s.reason = reason;
  s.status = "unwinding";
}
export class DurableWorkflowRunner {
  private readonly definitions: readonly WorkflowDefinition[];
  constructor(
    private readonly store: WorkflowStore,
    definitions: readonly WorkflowDefinition[],
    private readonly handlers: Readonly<Record<string, Activity>>,
  ) {
    this.definitions = snapshot(definitions);
  }
  async start(id: string, name: string, version: number, input: Json) {
    checkId(id);
    const plan = compile(this.definitions, name, version);
    for (const { step } of plan.nodes)
      if (step.kind === "task")
        for (const h of [step.handler, step.compensate])
          if (
            h &&
            (!Object.hasOwn(this.handlers, h) ||
              typeof this.handlers[h] !== "function")
          )
            throw Error("Missing workflow handler: " + h);
    const state: Instance = {
      id,
      plan,
      input: snapshot(input),
      status: "running",
      steps: Object.fromEntries(
        plan.nodes.map((n) => [n.path, { phase: "pending", attempt: 0 }]),
      ),
      completed: [],
    };
    if (!(await this.store.create(state))) {
      const existing = await this.store.get(id);
      if (
        !existing ||
        JSON.stringify(snapshot([existing.plan, existing.input])) !==
          JSON.stringify(snapshot([plan, state.input]))
      )
        throw Error("Conflicting workflow start");
    }
    return id;
  }
  inspect(id: string) {
    return this.store.get(id);
  }
  history(id: string, after = 0, limit = 100) {
    count(after, 0, Number.MAX_SAFE_INTEGER);
    count(limit, 1, 1000);
    return this.store.history(id, after, limit);
  }
  approve(id: string, path: string, accepted: boolean) {
    if (typeof accepted !== "boolean")
      throw new TypeError("Approval decision required");
    return this.store.update(id, (s, now, emit) => {
      const p = s.steps[path];
      if (s.status !== "running" || p?.phase !== "approval") return false;
      p.phase = accepted ? "done" : "failed";
      if (accepted) p.output = p.input!;
      else stop(s, "failed");
      emit({ at: now, type: accepted ? "approved" : "rejected", path });
      return true;
    });
  }
  cancel(id: string) {
    return this.store.update(id, (s, now, emit) => {
      if (s.status !== "running") return false;
      stop(s, "cancelled");
      emit({ at: now, type: "cancel-requested" });
      return true;
    });
  }
  /** Advance local transitions and execute at most one claimed activity. Multiple workers may call tick. */
  async tick(id: string) {
    const work = await this.store.update<Work | undefined>(
      id,
      (s, now, emit) => {
        if (s.status !== "running" && s.status !== "unwinding") return;
        const plan = compile(this.definitions, s.plan.name, s.plan.version);
        if (JSON.stringify(snapshot(plan)) !== JSON.stringify(snapshot(s.plan)))
          throw Error("Workflow definition changed");
        const event = (type: string, path?: string, attempt?: number) =>
          emit({
            at: now,
            type,
            ...(path ? { path } : {}),
            ...(attempt ? { attempt } : {}),
          });
        const claim = (node: Node, p: Progress, undo: boolean): Work => {
          if (node.step.kind !== "task") throw Error("Invalid activity");
          const timeout = node.step.timeoutMs ?? 30000;
          const token = crypto.randomUUID();
          const handler = undo ? node.step.compensate! : node.step.handler;
          if (
            !Object.hasOwn(this.handlers, handler) ||
            typeof this.handlers[handler] !== "function"
          )
            throw Error("Missing workflow handler: " + handler);
          p.phase = undo ? "undoing" : "active";
          p.token = token;
          p.at = now + timeout;
          p.attempt++;
          event(
            undo ? "compensation-started" : "step-started",
            node.path,
            p.attempt,
          );
          return {
            path: node.path,
            token,
            attempt: p.attempt,
            handler,
            input: snapshot(
              undo ? { input: p.input!, output: p.output! } : p.input!,
            ),
            timeout,
            undo,
          };
        };
        for (const node of plan.nodes) {
          const p = s.steps[node.path];
          if ((p.phase !== "active" && p.phase !== "undoing") || p.at! > now)
            continue;
          if (node.step.kind !== "task") throw Error("Invalid active step");
          const undo = p.phase === "undoing";
          delete p.token;
          event("lease-expired", node.path, p.attempt);
          if (undo) {
            if (p.attempt >= (node.step.attempts ?? 3)) {
              p.phase = "failed";
              s.status = "compensation-failed";
              event(s.status, node.path);
              return;
            }
            return claim(node, p, true);
          }
          if (
            p.attempt >= (node.step.attempts ?? 3) ||
            s.status === "unwinding"
          ) {
            p.phase = "failed";
            if (s.status === "running") stop(s, "failed");
          } else {
            p.phase = "ready";
            p.at = now + (node.step.retryMs ?? 0);
          }
        }
        const active = Object.values(s.steps).filter(
          (p) => p.phase === "active" || p.phase === "undoing",
        ).length;
        if (s.status === "unwinding") {
          if (active) return;
          for (let i = s.completed.length - 1; i >= 0; i--) {
            const path = s.completed[i],
              p = s.steps[path],
              node = plan.nodes.find((n) => n.path === path)!;
            if (
              p.phase === "done" &&
              node.step.kind === "task" &&
              node.step.compensate
            ) {
              p.attempt = 0;
              return claim(node, p, true);
            }
            if (
              p.phase === "ready" &&
              node.step.kind === "task" &&
              node.step.compensate
            ) {
              if (p.at! > now) return;
              return claim(node, p, true);
            }
          }
          s.status = s.reason!;
          event(s.status);
          return;
        }
        for (const node of plan.nodes) {
          const p = s.steps[node.path],
            step = node.step;
          if (p.phase === "pending") {
            const value = read(s, node.source);
            if (value === undefined) continue;
            p.input = value;
            if (step.kind === "wait") {
              p.phase = "waiting";
              p.at = now + step.delayMs;
              event("wait-started", node.path);
            } else if (step.kind === "approval") {
              p.phase = "approval";
              event("approval-requested", node.path);
            } else if (step.kind === "join") {
              p.phase = "done";
              p.output = value;
              event("child-completed", node.path);
            } else if (
              step.when &&
              (value === null ||
                typeof value !== "object" ||
                !Object.hasOwn(value, step.when.field) ||
                JSON.stringify(
                  snapshot((value as Record<string, Json>)[step.when.field]),
                ) !== JSON.stringify(snapshot(step.when.equals)))
            ) {
              p.phase = "skipped";
              p.output = value;
              event("step-skipped", node.path);
            } else {
              p.phase = "ready";
              p.at = now;
            }
          }
          if (p.phase === "waiting" && p.at! <= now) {
            p.phase = "done";
            p.output = p.input;
            event("wait-completed", node.path);
          }
          if (p.phase === "ready" && p.at! <= now && active < plan.concurrency)
            return claim(node, p, false);
        }
        const result = read(s, plan.result);
        if (result !== undefined) {
          s.status = "completed";
          s.output = result;
          event(s.status);
        }
      },
    );
    if (!work) return false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: Json | undefined;
    try {
      result = snapshot(
        await Promise.race([
          Promise.resolve().then(() =>
            this.handlers[work.handler](work.input, {
              instanceId: id,
              path: work.path,
              attempt: work.attempt,
              idempotencyKey: JSON.stringify([
                id,
                work.path,
                work.undo ? "undo" : "run",
              ]),
              signal: controller.signal,
            }),
          ),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(Error("Workflow activity timed out"));
            }, work.timeout);
          }),
        ]),
      );
    } catch {
      /* Only sanitized outcomes enter history. */
    } finally {
      clearTimeout(timer);
    }
    await this.store.update(id, (s, now, emit) => {
      const p = s.steps[work.path];
      if (p.token !== work.token || now >= p.at!) return;
      const step = s.plan.nodes.find((n) => n.path === work.path)!.step;
      if (step.kind !== "task") throw Error("Invalid activity");
      delete p.token;
      if (result !== undefined) {
        p.phase = work.undo ? "undone" : "done";
        if (!work.undo) {
          p.output = result;
          s.completed.push(work.path);
        }
      } else if (
        p.attempt < (step.attempts ?? 3) &&
        (work.undo || s.status === "running")
      ) {
        p.phase = "ready";
        p.at = now + (step.retryMs ?? 0);
      } else {
        p.phase = "failed";
        if (work.undo) s.status = "compensation-failed";
        else if (s.status === "running") stop(s, "failed");
      }
      emit({
        at: now,
        path: work.path,
        attempt: p.attempt,
        type:
          result !== undefined
            ? work.undo
              ? "compensated"
              : "step-completed"
            : work.undo
              ? "compensation-error"
              : "step-error",
      });
    });
    return true;
  }
}
