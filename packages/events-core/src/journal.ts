import type { DomainEvent } from "./index.js";

export interface JournalEvent extends DomainEvent {
  readonly schemaVersion: number;
  readonly correlationId?: string;
  readonly causationId?: string;
}
export interface JournalRecord {
  cursor: number;
  event: JournalEvent;
}
export interface SubscriptionState {
  checkpoint: number;
  attempt: number;
  token: string | null;
  availableAt: number;
  deadCursor: number | null;
}
export interface Snapshot {
  revision: number;
  now: number;
  state: SubscriptionState;
}
/** Each successful swap advances the revision and enforces the optional exclusive server-time deadline. */
export interface JournalStorage {
  append(event: JournalEvent): Promise<void>;
  read(after: number, limit: number): Promise<JournalRecord[]>;
  load(name: string): Promise<Snapshot>;
  swap(
    name: string,
    revision: number,
    state: SubscriptionState,
    deadline?: number,
  ): Promise<boolean>;
}
export interface Receipt {
  subscription: string;
  token: string;
  cursor: number;
}
export interface Delivery extends JournalRecord {
  attempt: number;
  receipt: Receipt;
}
export function initialSubscription(): SubscriptionState {
  return {
    checkpoint: 0,
    attempt: 0,
    token: null,
    availableAt: 0,
    deadCursor: null,
  };
}

function integer(n: number, min: number, max: number, field: string) {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new RangeError("Invalid " + field);
}
function identifier(s: string) {
  if (typeof s !== "string" || !s.trim() || s.length > 256 || s.includes("\0"))
    throw new TypeError("Invalid event identifier");
}
function normalize(event: DomainEvent & Partial<JournalEvent>): JournalEvent {
  identifier(event.id);
  identifier(event.type);
  if (
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt))
  )
    throw new TypeError("Invalid event time");
  const schemaVersion =
    event.schemaVersion === undefined ? 1 : event.schemaVersion;
  integer(schemaVersion, 1, 2147483647, "schema version");
  const normalized: JournalEvent = {
    id: event.id,
    type: event.type,
    payload: event.payload,
    occurredAt: new Date(event.occurredAt).toISOString(),
    schemaVersion,
    ...(event.correlationId === undefined
      ? {}
      : { correlationId: event.correlationId }),
    ...(event.causationId === undefined
      ? {}
      : { causationId: event.causationId }),
  };
  if (normalized.correlationId !== undefined)
    identifier(normalized.correlationId);
  if (normalized.causationId !== undefined) identifier(normalized.causationId);
  return JSON.parse(
    JSON.stringify(normalized, (_key, value) => {
      if (
        ["undefined", "function", "symbol"].includes(typeof value) ||
        (typeof value === "number" && !Number.isFinite(value))
      )
        throw new TypeError("Invalid JSON event");
      return value;
    }),
  );
}

export function createEventJournal(storage: JournalStorage) {
  async function settle(
    receipt: Receipt,
    action: "ack" | "nack",
    maxAttempts: number,
    delayMs: number,
  ) {
    identifier(receipt.subscription);
    identifier(receipt.token);
    const { state, revision, now } = await storage.load(receipt.subscription);
    if (state.token !== receipt.token || now >= state.availableAt) return false;
    const [record] = await storage.read(state.checkpoint, 1);
    if (!record || record.cursor !== receipt.cursor) return false;
    const next =
      action === "ack"
        ? { ...initialSubscription(), checkpoint: record.cursor }
        : {
            ...state,
            token: null,
            availableAt: now + delayMs,
            deadCursor: state.attempt >= maxAttempts ? record.cursor : null,
          };
    return storage.swap(
      receipt.subscription,
      revision,
      next,
      state.availableAt,
    );
  }
  return {
    append: (event: DomainEvent & Partial<JournalEvent>) =>
      storage.append(normalize(event)),
    replay(after = 0, limit = 100) {
      integer(after, 0, Number.MAX_SAFE_INTEGER, "cursor");
      integer(limit, 1, 1000, "page size");
      return storage.read(after, limit);
    },
    async inspect(name: string) {
      identifier(name);
      const { checkpoint, attempt, availableAt, deadCursor } = (
        await storage.load(name)
      ).state;
      return { checkpoint, attempt, availableAt, deadCursor };
    },
    async claim(name: string, leaseMs: number): Promise<Delivery | undefined> {
      identifier(name);
      integer(leaseMs, 1, 2147483647, "lease duration");
      const { state, revision, now } = await storage.load(name);
      if (state.deadCursor !== null || state.availableAt > now) return;
      const [record] = await storage.read(state.checkpoint, 1);
      if (!record) return;
      const token = crypto.randomUUID();
      const next = {
        ...state,
        token,
        attempt: state.attempt + 1,
        availableAt: now + leaseMs,
      };
      if (await storage.swap(name, revision, next, next.availableAt)) {
        return {
          ...record,
          attempt: next.attempt,
          receipt: { subscription: name, token, cursor: record.cursor },
        };
      }
    },
    ack: (receipt: Receipt) => settle(receipt, "ack", 1, 0),
    nack(receipt: Receipt, options: { maxAttempts: number; delayMs: number }) {
      integer(options.maxAttempts, 1, 2147483647, "attempt limit");
      integer(options.delayMs, 0, 2147483647, "retry delay");
      return settle(receipt, "nack", options.maxAttempts, options.delayMs);
    },
    async redrive(name: string, cursor: number) {
      identifier(name);
      integer(cursor, 1, Number.MAX_SAFE_INTEGER, "cursor");
      const { state, revision } = await storage.load(name);
      if (state.deadCursor !== cursor) return false;
      return storage.swap(name, revision, {
        ...initialSubscription(),
        checkpoint: state.checkpoint,
      });
    },
  };
}
export type EventJournal = ReturnType<typeof createEventJournal>;
