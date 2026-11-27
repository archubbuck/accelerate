export interface StateEvent { type: string }

export interface StateSnapshot<State extends string, Context> {
  readonly id: string;
  readonly state: State;
  readonly context: Context;
  readonly revision: number;
}

export interface TransitionRecord<State extends string, Event extends StateEvent> {
  readonly revision: number;
  readonly from: State;
  readonly to: State;
  readonly event: Event;
  readonly at: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StateMachineStore<State extends string, Context, Event extends StateEvent> {
  create(snapshot: StateSnapshot<State, Context>): Promise<boolean>;
  get(id: string): Promise<StateSnapshot<State, Context> | undefined>;
  /** Atomically commit the snapshot and its transition only at the expected revision. */
  commit(id: string, expectedRevision: number, snapshot: StateSnapshot<State, Context>, record: TransitionRecord<State, Event>): Promise<boolean>;
  history(id: string, after: number, limit: number): Promise<readonly TransitionRecord<State, Event>[]>;
}

type Awaitable<Value> = Value | Promise<Value>;
type Handler<Context, Event> = (context: Readonly<Context>, event: Readonly<Event>) => Awaitable<Context>;
type Transition<State extends string, Context, Event extends StateEvent> = {
  [Type in Event["type"]]: {
    on: Type;
    to: State;
    guard?: (context: Readonly<Context>, event: Readonly<Extract<Event, { type: Type }>>) => Awaitable<boolean>;
    reduce?: Handler<Context, Extract<Event, { type: Type }>>;
    metadata?: Readonly<Record<string, unknown>>;
  };
}[Event["type"]];

export interface StateMachineDefinition<State extends string, Context, Event extends StateEvent> {
  initial: State;
  states: Readonly<Record<State, {
    terminal?: boolean;
    enter?: Handler<Context, Event>;
    exit?: Handler<Context, Event>;
    transitions?: readonly Transition<State, Context, Event>[];
  }>>;
}

export class StateConflictError extends Error {
  constructor() { super("State machine revision changed"); this.name = "StateConflictError"; }
}

export class StateTransitionError extends Error {
  constructor(readonly code: "TERMINAL" | "UNDEFINED_TRANSITION" | "GUARD_REJECTED") {
    super("State change is not allowed");
    this.name = "StateTransitionError";
  }
}

export function createMemoryStateMachineStore<S extends string, C, E extends StateEvent>(): StateMachineStore<S, C, E> {
  const rows = new Map<string, { snapshot: StateSnapshot<S, C>; transitions: TransitionRecord<S, E>[] }>();
  return {
    async create(snapshot) {
      if (rows.has(snapshot.id)) return false;
      rows.set(snapshot.id, { snapshot: structuredClone(snapshot), transitions: [] });
      return true;
    },
    async get(id) { return structuredClone(rows.get(id)?.snapshot); },
    async commit(id, expected, snapshot, record) {
      const row = rows.get(id);
      if (!row || row.snapshot.revision !== expected) return false;
      const next = structuredClone(snapshot);
      const transition = structuredClone(record);
      row.snapshot = next;
      row.transitions.push(transition);
      return true;
    },
    async history(id, after, limit) {
      return structuredClone((rows.get(id)?.transitions ?? []).filter(record => record.revision > after).slice(0, limit));
    },
  };
}

export function createStateMachine<S extends string, C, E extends StateEvent>(
  definition: StateMachineDefinition<S, C, E>,
  store: StateMachineStore<S, C, E>,
  now: () => Date = () => new Date(),
) {
  const states = definition.states;
  if (!Object.hasOwn(states, definition.initial)) throw new TypeError("Unknown initial state");
  for (const state of Object.values<typeof states[S]>(states)) {
    if (state.terminal && state.transitions?.length) throw new TypeError("Terminal state cannot declare transitions");
    for (const transition of state.transitions ?? []) {
      if (!Object.hasOwn(states, transition.to)) throw new TypeError("Unknown transition target");
    }
  }

  async function create(snapshot: StateSnapshot<S, C>) {
    if (!snapshot.id || !Object.hasOwn(states, snapshot.state)
      || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new TypeError("Invalid state snapshot");
    const copy = structuredClone(snapshot);
    if (!await store.create(copy)) throw new StateConflictError();
    return copy;
  }

  return {
    start: (id: string, context: C) => create({ id, state: definition.initial, context, revision: 0 }),
    restore: (snapshot: StateSnapshot<S, C>) => create(snapshot),
    inspect: (id: string) => store.get(id),
    history(id: string, after = 0, limit = 100) {
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
        throw new RangeError("Invalid state history page");
      }
      return store.history(id, after, limit);
    },
    describe(state: S) {
      if (!Object.hasOwn(states, state)) throw new TypeError("Unknown state");
      return { terminal: !!states[state].terminal, transitions: (states[state].transitions ?? []).map(({ on, to }) => ({ on, to })) };
    },
    async send(id: string, event: E, expectedRevision?: number) {
      const current = await store.get(id);
      if (!current || !Object.hasOwn(states, current.state)) throw new TypeError("Unknown state instance");
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new StateConflictError();
      const configuration = states[current.state];
      if (configuration.terminal) throw new StateTransitionError("TERMINAL");
      const data = structuredClone(event);
      const candidates = (configuration.transitions ?? []).filter(transition => transition.on === data.type);
      if (!candidates.length) throw new StateTransitionError("UNDEFINED_TRANSITION");
      let selected: Transition<S, C, E> | undefined;
      for (const candidate of candidates) {
        // Matching the discriminator narrows the runtime event to the guard's declared event type.
        if (!candidate.guard || await candidate.guard(structuredClone(current.context), structuredClone(data) as never)) {
          selected = candidate;
          break;
        }
      }
      if (!selected) throw new StateTransitionError("GUARD_REJECTED");
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new RangeError("State revision exhausted");
      let context = structuredClone(current.context);
      if (configuration.exit) context = await configuration.exit(context, structuredClone(data));
      if (selected.reduce) context = await selected.reduce(context, structuredClone(data) as never);
      const enter = states[selected.to].enter;
      if (enter) context = await enter(context, structuredClone(data));
      const snapshot = { id, state: selected.to, context: structuredClone(context), revision: current.revision + 1 };
      const record = {
        revision: snapshot.revision, from: current.state, to: snapshot.state, event: data,
        at: now().toISOString(), ...(selected.metadata ? { metadata: structuredClone(selected.metadata) } : {}),
      };
      if (!await store.commit(id, current.revision, snapshot, record)) throw new StateConflictError();
      return { snapshot, transition: record };
    },
  };
}
