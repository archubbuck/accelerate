import {it,expect} from "vitest";import {MemoryFlagStore} from "./index.js";
it("isolates stored values and supports deletion",async()=>{const flag={key:"x",enabled:true};const store=new MemoryFlagStore([flag]);flag.enabled=false;expect(await store.get("x")).toEqual({key:"x",enabled:true});expect(store.delete("x")).toBe(true);expect(await store.get("x")).toBeUndefined();});
