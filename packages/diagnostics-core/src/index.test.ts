import {it,expect} from "vitest";import {runDiagnostics} from "./index.js";
it("isolates check failures",async()=>{const results=await runDiagnostics([{name:"ok",run:async()=>true},{name:"bad",run:async()=>{throw Error("secret");}}]);expect(results.map(r=>r.status)).toEqual(["pass","fail"]);expect(JSON.stringify(results)).not.toContain("secret");});
