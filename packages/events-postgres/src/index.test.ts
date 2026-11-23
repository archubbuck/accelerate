import { describe,it,expect,vi } from "vitest";
import { createPostgresEventStore } from "./index.js";
describe("postgres events",()=>{it("parameterizes append and maps results",async()=>{const query=vi.fn().mockResolvedValue({rows:[],rowCount:0});const store=createPostgresEventStore({query});await store.append({id:"1",type:"created",payload:{n:1},occurredAt:"2026-01-01T00:00:00.000Z"});expect(query).toHaveBeenCalledOnce();expect(query.mock.calls[0][1][0]).toBe("1");await expect(store.list("created",0)).rejects.toThrow();});});
