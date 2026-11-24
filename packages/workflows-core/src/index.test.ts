import {it,expect,vi} from "vitest";import {WorkflowRunner} from "./index.js";
it("executes steps in order",async()=>{const runner=new WorkflowRunner({enqueue:vi.fn(async()=>"job")},{publish:async()=>{},subscribe:()=>()=>{}});expect(await runner.run("w",2,[{id:"a",run:async n=>n+1},{id:"b",run:async n=>n*3}])).toBe(9);});
