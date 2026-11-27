import { expect, it, vi } from "vitest";
import { createStreamingConnection, StreamBackpressureError } from "./index.js";
import { createMemoryStreamingPair } from "./memory.js";
import { createWebSocketStreamingTransport } from "./websocket.js";

const wire = (sequence: number, data: unknown) => JSON.stringify({ type: "message", subscription: "orders", sequence, data });
const freshSignal = () => new AbortController().signal;

it("reconnects, restores cursors, rejects malformed messages and reports gaps", async () => {
  const peers: ReturnType<typeof createMemoryStreamingPair>[1][] = [];
  const delay = vi.fn(async () => {});
  const events = vi.fn();
  const connection = createStreamingConnection(async () => {
    const [client, server] = createMemoryStreamingPair();
    peers.push(server);
    return client;
  }, {
    subscriptions: [{ id: "orders", after: 1 }],
    parse(value) {
      if (typeof value !== "string") throw new TypeError();
      return value;
    },
    clock: { delay },
    onEvent: events,
  });
  const first = connection.messages.next();
  await vi.waitFor(() => expect(peers).toHaveLength(1));
  expect(JSON.parse(await peers[0].receive(freshSignal()))).toEqual({ type: "subscribe", subscription: "orders", after: 1 });
  peers[0].send(wire(2, "first"));
  expect((await first).value).toEqual({ subscription: "orders", sequence: 2, data: "first" });
  peers[0].close();
  const second = connection.messages.next();
  await vi.waitFor(() => expect(peers).toHaveLength(2));
  expect(delay).toHaveBeenCalledWith(100, expect.any(AbortSignal));
  expect(JSON.parse(await peers[1].receive(freshSignal()))).toEqual({ type: "subscribe", subscription: "orders", after: 2 });
  peers[1].send(wire(2, "duplicate"));
  peers[1].send(wire(3, 43));
  peers[1].send(wire(5, "second"));
  expect((await second).value).toEqual({ subscription: "orders", sequence: 5, data: "second", gap: { from: 3, to: 4 } });
  expect(events).toHaveBeenCalledWith({ type: "invalid-message" });
  connection.close();
  await expect(peers[1].receive(freshSignal())).rejects.toThrow("disconnected");
  expect((await connection.messages.next()).done).toBe(true);
});

it("sends an idle heartbeat and interrupts a pending read on shutdown", async () => {
  const [client, server] = createMemoryStreamingPair();
  const connection = createStreamingConnection(async () => client, {
    subscriptions: [], parse: value => value, heartbeat: { idleMs: 5, timeoutMs: 1000 },
  });
  const next = connection.messages.next();
  expect(JSON.parse(await server.receive(freshSignal()))).toEqual({ type: "ping" });
  server.send(JSON.stringify({ type: "pong" }));
  connection.close();
  await expect(next).resolves.toEqual({ done: true, value: undefined });
});

it("bounds both in-memory queues and WebSocket pending writes", async () => {
  const [client, server] = createMemoryStreamingPair({ maxMessages: 1 });
  server.send("one");
  expect(() => server.send("two")).toThrow(StreamBackpressureError);
  await expect(client.receive(freshSignal())).rejects.toBeInstanceOf(StreamBackpressureError);

  class FakeSocket extends EventTarget {
    readyState = 1;
    bufferedAmount = 0;
    send = vi.fn();
    close = vi.fn(() => { this.readyState = 3; });
  }
  const socket = new FakeSocket();
  const connect = createWebSocketStreamingTransport("wss://example.com", {
    createSocket: () => socket, maxPendingSendBytes: 3,
  });
  const session = await connect(freshSignal());
  socket.dispatchEvent(new MessageEvent("message", { data: "received" }));
  expect(await session.receive(freshSignal())).toBe("received");
  expect(() => session.send("four")).toThrow(StreamBackpressureError);
  expect(socket.close).toHaveBeenCalledOnce();
});
