import type { StreamingSession } from "./index.js";
import { createMessageQueue } from "./queue.js";

export function createMemoryStreamingPair(options: { maxMessages?: number; maxBytes?: number } = {}): [StreamingSession, StreamingSession] {
  const queues = [0, 1].map(() => createMessageQueue(options.maxMessages ?? 256, options.maxBytes ?? 1024 * 1024));
  const close = () => { for (const queue of queues) queue.close(); };
  const endpoint = (inbound: number, outbound: number): StreamingSession => ({
    send(message) {
      try { queues[outbound].push(message); }
      catch (error) { close(); throw error; }
    },
    receive: queues[inbound].receive,
    close,
  });
  return [endpoint(0, 1), endpoint(1, 0)];
}
