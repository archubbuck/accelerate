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
