import {it,expect} from "vitest";import {OpenApiBuilder} from "./index.js";
it("builds operations and rejects duplicate ids",()=>{const builder=new OpenApiBuilder("API","1");const op={operationId:"list",responses:{"200":{description:"OK"}}};builder.add("/items","get",op);expect(builder.build().paths["/items"]?.get).toEqual(op);expect(()=>builder.add("/other","get",op)).toThrow("Duplicate");});
