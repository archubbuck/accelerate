import { it, expect } from "vitest";
import { createHttpClient } from "./index.js";
it("parses JSON responses", async () => {
 const client = createHttpClient({fetch: async () => new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json"}})});
 const result = await client.send<{ok:boolean}>({method:"GET",url:"https://example.com"});
 expect(result.body.ok).toBe(true);
});
