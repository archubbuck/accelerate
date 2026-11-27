import { describe, it, expect, vi } from "vitest";
import { createHttpClient } from "./index.js";
describe("createHttpClient", () => {
 it("parses JSON responses", async () => {
  const client = createHttpClient({fetch: async () => new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json"}})});
  expect((await client.send<{ok:boolean}>({method:"GET",url:"https://example.com"})).body.ok).toBe(true);
 });
 it("serializes objects and sets JSON content type", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
   expect(init?.body).toBe(JSON.stringify({hello:"world"}));
   expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
   return new Response(null,{status:204});
  });
  const client = createHttpClient({fetch:fetcher});
  const result = await client.send({method:"POST",url:"https://example.com",body:{hello:"world"}});
  expect(result.status).toBe(204);
  expect(result.body).toBeUndefined();
 });
 it("rejects invalid timeout values", () => expect(()=>createHttpClient({timeoutMs:-1})).toThrow(RangeError));
});

it("returns streaming bodies before the final chunk and enforces byte limits while reading", async () => {
 let source!: ReadableStreamDefaultController<Uint8Array>;
 const stream = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
 const client = createHttpClient({ fetch: async () => new Response(stream), responseBody: "stream", maxResponseBytes: 3 });
 const response = await client.send<ReadableStream<Uint8Array>>({ method: "GET", url: "https://example.com" });
 const reader = response.body.getReader();
 source.enqueue(new Uint8Array([1, 2]));
 expect(await reader.read()).toEqual({ done: false, value: new Uint8Array([1, 2]) });
 source.enqueue(new Uint8Array([3, 4]));
 await expect(reader.read()).rejects.toMatchObject({ name: "HttpBodyLimitError", maxBytes: 3 });
});
