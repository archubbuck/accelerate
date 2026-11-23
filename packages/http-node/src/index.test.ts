import { it, expect } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { createNodeHttpHandler } from "./index.js";
it("responds to HTTP requests", async () => {
 const server = createServer(createNodeHttpHandler(async request => ({status:200,headers:{"content-type":"application/json"},body:{method:request.method}})));
 server.listen(0,"127.0.0.1");
 try {
  await once(server,"listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  const response = await fetch("http://127.0.0.1:"+address.port);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({method:"GET"});
 } finally { server.close(); }
});
