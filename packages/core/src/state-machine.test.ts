import { expect, it } from "vitest";
import { createMemoryStateMachineStore, createStateMachine, type StateMachineDefinition } from "./state-machine.js";

type State = "draft" | "review" | "done";
type Context = { value: number };
type Event = { type: "submit"; value: number } | { type: "approve" };
const definition: StateMachineDefinition<State, Context, Event> = {
  initial: "draft",
  states: {
    draft: { exit: context => ({ value: context.value + 1 }), transitions: [{
      on: "submit", to: "review", guard: async (_, event) => event.value > 0,
      reduce: (context, event) => ({ value: context.value + event.value }), metadata: { action: "review" },
    }] },
    review: { enter: context => ({ value: context.value + 1 }), transitions: [{ on: "approve", to: "done" }] },
    done: { terminal: true },
  },
};

it("runs guarded handlers in order, records history, and restores a typed snapshot", async () => {
  const machine = createStateMachine(definition, createMemoryStateMachineStore<State, Context, Event>());
  await machine.start("test", { value: 0 });
  await expect(machine.send("test", { type: "approve" })).rejects.toMatchObject({ code: "UNDEFINED_TRANSITION" });
  await expect(machine.send("test", { type: "submit", value: 0 })).rejects.toMatchObject({ code: "GUARD_REJECTED" });
  const { snapshot, transition } = await machine.send("test", { type: "submit", value: 4 }, 0);
  expect(snapshot).toMatchObject({ state: "review", context: { value: 6 }, revision: 1 });
  expect(transition.metadata).toEqual({ action: "review" });
  expect(await machine.history("test")).toEqual([transition]);
  expect(machine.describe("review")).toEqual({ terminal: false, transitions: [{ on: "approve", to: "done" }] });

  const restored = createStateMachine(definition, createMemoryStateMachineStore<State, Context, Event>());
  await restored.restore(JSON.parse(JSON.stringify(snapshot)));
  expect((await restored.send("test", { type: "approve" })).snapshot.revision).toBe(2);
  await expect(restored.send("test", { type: "approve" })).rejects.toMatchObject({ code: "TERMINAL" });
});

it("only commits one transition for an optimistic revision", async () => {
  const machine = createStateMachine(definition, createMemoryStateMachineStore<State, Context, Event>());
  await machine.start("test", { value: 0 });
  const results = await Promise.allSettled([
    machine.send("test", { type: "submit", value: 1 }, 0),
    machine.send("test", { type: "submit", value: 2 }, 0),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const conflict = results.find(result => result.status === "rejected");
  expect(conflict).toMatchObject({ reason: { name: "StateConflictError" } });
  expect(await machine.history("test")).toHaveLength(1);
});
