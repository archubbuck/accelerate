import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { createNodeHttpHandler } from "./index.js";
async function withServer(handler: ReturnType<typeof createNodeHttpHandler>, test: (url: string) => Promise<void>) {
 const server = createServer(handler);
 server.listen(0,"127.0.0.1");
 try {
  await once(server,"listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  await test("http://127.0.0.1:"+address.port);
 } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
}
describe("createNodeHttpHandler", () => {
 it("responds with JSON", async () => {
  await withServer(createNodeHttpHandler(async request=>({status:200,headers:{},body:{method:request.method}})), async url => {
   const response=await fetch(url);
   expect(response.headers.get("content-type")).toContain("application/json");
   expect(await response.json()).toEqual({method:"GET"});
  });
 });
 it("enforces request body limits", async () => {
  await withServer(createNodeHttpHandler(async()=>({status:200,headers:{},body:"ok"}),{maxBodyBytes:3}), async url => {
   const response=await fetch(url,{method:"POST",body:"too large"});
   expect(response.status).toBe(413);
  });
 });
 it("does not leak handler exceptions", async () => {
  await withServer(createNodeHttpHandler(async()=>{throw Error("secret");}), async url => {
   const response=await fetch(url);
   expect(response.status).toBe(500);
   expect(await response.text()).not.toContain("secret");
  });
 });
});

it("flushes a streamed response before the producer closes it", async () => {
 let controller!: ReadableStreamDefaultController<Uint8Array>;
 const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
 controller.enqueue(new TextEncoder().encode("first"));
 await withServer(createNodeHttpHandler(async () => ({ status: 200, headers: {}, body })), async url => {
  const response = await fetch(url);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
  controller.close();
  expect((await reader.read()).done).toBe(true);
 });
});

it("bounds streamed request bodies and sends a safe 413 envelope", async () => {
 const handler = createNodeHttpHandler(async request => {
  const body = await new Response(request.body as ReadableStream).text();
  return { status: 200, headers: {}, body };
 }, { requestBody: "stream", maxBodyBytes: 3 });
 await withServer(handler, async url => {
  const send = (text: string) => {
   const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(text));
    controller.close();
   } });
   const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half" };
   return fetch(url, init);
  };
  expect(await (await send("ok")).text()).toBe("ok");
  const large = await send("overflow");
  expect(large.status).toBe(413);
  expect(await large.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
 });
});
