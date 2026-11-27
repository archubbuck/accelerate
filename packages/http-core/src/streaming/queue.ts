import { StreamBackpressureError, StreamDisconnectedError } from "./index.js";

export function createMessageQueue(maxMessages: number, maxBytes: number) {
  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("Streaming queue limits must be positive safe integers");
  }
  const encoder = new TextEncoder();
  const messages: Array<{ data: string; bytes: number }> = [];
  let bytes = 0;
  let pending: { resolve(data: string): void; reject(error: unknown): void } | undefined;
  let terminal: Error | undefined;

  function fail(error: Error) {
    if (terminal) return;
    terminal = error;
    messages.length = 0;
    bytes = 0;
    pending?.reject(error);
  }

  return {
    push(data: string) {
      if (terminal) throw terminal;
      const size = data.length > maxBytes ? data.length : encoder.encode(data).byteLength;
      if (size > maxBytes || bytes + size > maxBytes || messages.length >= maxMessages) {
        const error = new StreamBackpressureError();
        fail(error);
        throw error;
      }
      if (pending) pending.resolve(data);
      else { messages.push({ data, bytes: size }); bytes += size; }
    },
    receive(signal: AbortSignal): Promise<string> {
      return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        if (terminal) throw terminal;
        if (pending) throw new Error("Only one streaming read may be active");
        const next = messages.shift();
        if (next) { bytes -= next.bytes; resolve(next.data); return; }
        const cleanup = () => { pending = undefined; signal.removeEventListener("abort", abort); };
        const abort = () => { cleanup(); reject(signal.reason); };
        pending = {
          resolve(data) { cleanup(); resolve(data); },
          reject(error) { cleanup(); reject(error); },
        };
        signal.addEventListener("abort", abort, { once: true });
      });
    },
    close(error = new StreamDisconnectedError()) { fail(error); },
  };
}
