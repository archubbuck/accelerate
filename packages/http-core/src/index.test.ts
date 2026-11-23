import { it, expect } from "vitest";
import { composeMiddleware } from "./index.js";
it("executes middleware in order", async () => {
 const calls: string[] = [];
 const transport = composeMiddleware({send: async () => ({status:200,headers:{},body:"ok"})}, [
 async (request,next) => {calls.push("before"); const result = await next(request); calls.push("after"); return result;}
 ]);
 expect((await transport.send({method:"GET",url:"/"})).status).toBe(200);
 expect(calls).toEqual(["before","after"]);
});
