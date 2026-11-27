import type {
  Instance,
  WorkflowEvent,
  WorkflowStore,
} from "@accelerate/workflows-core";
export function createMemoryWorkflowStore(
  clock: () => number = Date.now,
): WorkflowStore {
  const runs = new Map<string, { state: Instance; events: WorkflowEvent[] }>();
  return {
    async create(instance) {
      if (runs.has(instance.id)) return false;
      runs.set(instance.id, {
        state: structuredClone(instance),
        events: [{ at: clock(), type: "started" }],
      });
      return true;
    },
    async get(id) {
      return structuredClone(runs.get(id)?.state);
    },
    async update(id, fn) {
      const run = runs.get(id);
      if (!run) throw Error("Unknown workflow instance");
      const state = structuredClone(run.state),
        events: WorkflowEvent[] = [];
      const result = fn(state, clock(), (event) => events.push(event));
      run.state = structuredClone(state);
      run.events.push(...structuredClone(events));
      return result;
    },
    async history(id, after = 0, limit = 100) {
      return structuredClone(
        (runs.get(id)?.events ?? [])
          .slice(after, after + limit)
          .map((event, index) => ({ ...event, cursor: after + index + 1 })),
      );
    },
  };
}
