import { StreamBackpressureError, StreamDisconnectedError, type StreamingTransport } from "./index.js";
import { createMessageQueue } from "./queue.js";

export interface StreamingWebSocket extends EventTarget {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
  close(code?: number): void;
}

export interface WebSocketStreamingOptions {
  createSocket?: (url: string) => StreamingWebSocket;
  maxMessages?: number;
  maxQueueBytes?: number;
  maxPendingSendBytes?: number;
}

export function createWebSocketStreamingTransport(url: string, options: WebSocketStreamingOptions = {}): StreamingTransport {
  const create = options.createSocket ?? (address => new WebSocket(address));
  const maxPending = options.maxPendingSendBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new RangeError("Invalid WebSocket send limit");
  const encoder = new TextEncoder();
  return async signal => {
    signal.throwIfAborted();
    const queue = createMessageQueue(options.maxMessages ?? 256, options.maxQueueBytes ?? 1024 * 1024);
    const socket = create(url);
    let rejectOpen: (error: unknown) => void = () => {};
    let closed = false;
    const cleanup = () => {
      socket.removeEventListener("open", opened);
      socket.removeEventListener("message", message);
      socket.removeEventListener("error", disconnected);
      socket.removeEventListener("close", disconnected);
      signal.removeEventListener("abort", aborted);
    };
    const close = (error = new StreamDisconnectedError()) => {
      if (closed) return;
      closed = true;
      cleanup();
      queue.close(error);
      rejectOpen(error);
      if (socket.readyState < 2) socket.close();
    };
    const opened = () => { resolveOpen(); };
    const disconnected = () => close();
    const aborted = () => close(new StreamDisconnectedError("WebSocket connection aborted"));
    const message = (event: Event) => {
      const data: unknown = (event as MessageEvent).data;
      if (typeof data !== "string") { close(new StreamDisconnectedError("Expected a WebSocket text message")); return; }
      try { queue.push(data); }
      catch { close(new StreamBackpressureError()); }
    };
    let resolveOpen: () => void;
    const connected = new Promise<void>((resolve, reject) => { resolveOpen = resolve; rejectOpen = reject; });
    socket.addEventListener("open", opened, { once: true });
    socket.addEventListener("message", message);
    socket.addEventListener("close", disconnected, { once: true });
    socket.addEventListener("error", disconnected, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    else if (socket.readyState === 1) opened();
    else if (socket.readyState > 1) disconnected();
    await connected;
    return {
      send(data) {
        if (closed || socket.readyState !== 1) throw new StreamDisconnectedError();
        const available = maxPending - socket.bufferedAmount;
        if (data.length > available || encoder.encode(data).byteLength > available) {
          const error = new StreamBackpressureError();
          close(error);
          throw error;
        }
        socket.send(data);
      },
      receive: queue.receive,
      close,
    };
  };
}
