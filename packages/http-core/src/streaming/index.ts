import { systemClock, type Clock } from "@accelerate/time-core";
import { assertHttpTimeout } from "../middleware.js";

export interface StreamingSession {
  send(message: string): void;
  receive(signal: AbortSignal): Promise<string>;
  close(): void;
}

export type StreamingTransport = (signal: AbortSignal) => Promise<StreamingSession>;

export interface StreamSubscription {
  id: string;
  after?: number;
}

export interface StreamMessage<T> {
  subscription: string;
  sequence: number;
  data: T;
  gap?: { from: number; to: number };
}

export type StreamingEvent =
  | { type: "connected" }
  | { type: "disconnected"; error: unknown; delayMs: number }
  | { type: "invalid-message" }
  | { type: "closed" };

export interface StreamingOptions<T> {
  subscriptions: readonly StreamSubscription[];
  parse: (payload: unknown, subscription: string) => T;
  signal?: AbortSignal;
  onEvent?: (event: StreamingEvent) => void;
  reconnect?: { initialMs?: number; maxMs?: number; maxFailures?: number };
  heartbeat?: { idleMs: number; timeoutMs: number };
  clock?: Pick<Clock, "delay">;
  connectTimeoutMs?: number;
}

export class StreamDisconnectedError extends Error {
  constructor(message = "Streaming transport disconnected") {
    super(message);
    this.name = "StreamDisconnectedError";
  }
}

export class StreamBackpressureError extends StreamDisconnectedError {
  constructor() {
    super("Streaming queue exceeded its configured capacity");
    this.name = "StreamBackpressureError";
  }
}

function readEnvelope(raw: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* Invalid input is reported by the caller. */ }
}

async function receive(
  session: StreamingSession,
  signal: AbortSignal,
  heartbeat: StreamingOptions<unknown>["heartbeat"],
): Promise<string> {
  if (!heartbeat) return session.receive(signal);
  const idle = AbortSignal.timeout(heartbeat.idleMs);
  try {
    return await session.receive(AbortSignal.any([signal, idle]));
  } catch (error) {
    if (!idle.aborted || signal.aborted || error !== idle.reason) throw error;
    session.send(JSON.stringify({ type: "ping" }));
    return session.receive(AbortSignal.any([signal, AbortSignal.timeout(heartbeat.timeoutMs)]));
  }
}

export function createStreamingConnection<T>(transport: StreamingTransport, options: StreamingOptions<T>) {
  const cursors = new Map<string, number | undefined>();
  for (const { id, after } of options.subscriptions) {
    if (!id || cursors.has(id) || (after !== undefined && (!Number.isSafeInteger(after) || after < 0))) {
      throw new TypeError("Invalid or duplicate stream subscription");
    }
    cursors.set(id, after);
  }
  const initialMs = options.reconnect?.initialMs ?? 100;
  const maxMs = options.reconnect?.maxMs ?? 5000;
  const maxFailures = options.reconnect?.maxFailures ?? Infinity;
  const connectTimeoutMs = options.connectTimeoutMs ?? 10000;
  for (const delay of [initialMs, maxMs, connectTimeoutMs]) assertHttpTimeout(delay);
  if (options.heartbeat) {
    assertHttpTimeout(options.heartbeat.idleMs);
    assertHttpTimeout(options.heartbeat.timeoutMs);
  }
  if (maxMs < initialMs || (maxFailures !== Infinity && (!Number.isSafeInteger(maxFailures) || maxFailures < 0))) {
    throw new RangeError("Invalid streaming reconnect policy");
  }
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const clock = options.clock ?? systemClock;
  const event = (value: StreamingEvent) => {
    try { options.onEvent?.(value); } catch { /* Observers cannot interrupt delivery. */ }
  };

  async function* messages(): AsyncGenerator<StreamMessage<T>> {
    let failures = 0;
    try {
      while (!signal.aborted) {
        let session: StreamingSession | undefined;
        let failure: unknown;
        const closeSession = () => session?.close();
        try {
          const connecting = new AbortController();
          const timer = setTimeout(() => connecting.abort(new StreamDisconnectedError("Streaming connection timed out")), connectTimeoutMs);
          try { session = await transport(AbortSignal.any([signal, connecting.signal])); }
          finally { clearTimeout(timer); }
          connecting.signal.throwIfAborted();
          signal.addEventListener("abort", closeSession, { once: true });
          signal.throwIfAborted();
          for (const [subscription, after] of cursors) {
            session.send(JSON.stringify({ type: "subscribe", subscription, after }));
          }
          event({ type: "connected" });
          while (!signal.aborted) {
            const input = readEnvelope(await receive(session, signal, options.heartbeat));
            if (input?.type === "pong") { failures = 0; continue; }
            if (input?.type === "ping") { session.send(JSON.stringify({ type: "pong" })); continue; }
            const subscription = input?.subscription;
            const sequence = input?.sequence;
            if (input?.type !== "message" || typeof subscription !== "string" || !cursors.has(subscription)
              || typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0) {
              event({ type: "invalid-message" });
              continue;
            }
            const previous = cursors.get(subscription);
            if (previous !== undefined && sequence <= previous) continue;
            let data: T;
            try { data = options.parse(input.data, subscription); }
            catch { event({ type: "invalid-message" }); continue; }
            const gap = previous !== undefined && sequence > previous + 1
              ? { from: previous + 1, to: sequence - 1 } : undefined;
            cursors.set(subscription, sequence);
            failures = 0;
            yield { subscription, sequence, data, ...(gap ? { gap } : {}) };
          }
        } catch (error) {
          failure = error;
        } finally {
          signal.removeEventListener("abort", closeSession);
          session?.close();
        }
        if (signal.aborted) return;
        if (failures >= maxFailures) throw failure;
        const delayMs = Math.min(maxMs, initialMs * 2 ** Math.min(failures++, 52));
        event({ type: "disconnected", error: failure, delayMs });
        try { await clock.delay(delayMs, signal); }
        catch (error) { if (!signal.aborted) throw error; }
      }
    } finally {
      event({ type: "closed" });
    }
  }
  return { messages: messages(), close: () => controller.abort() };
}
