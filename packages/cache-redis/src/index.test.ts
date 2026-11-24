import { expect,it,vi } from "vitest";
import { RedisCache } from "./index.js";
it("namespaces values and rounds TTL",async()=>{const client={get:vi.fn(async()=> '{"a":1}'),set:vi.fn(async()=>{}),del:vi.fn(async()=>1),scan:vi.fn(async()=>({cursor:"0",keys:["test:a","other:a"]}))};const cache=new RedisCache(client,"test");await cache.set("a",{a:1},1.2);expect(client.set).toHaveBeenCalledWith("test:a",'{"a":1}',2);expect(await cache.get("a")).toEqual({a:1});await cache.clear();expect(client.del).toHaveBeenCalledWith("test:a");expect(client.del).not.toHaveBeenCalledWith("other:a");});
