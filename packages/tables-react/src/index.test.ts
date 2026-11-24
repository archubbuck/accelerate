import {it,expect} from "vitest";import {useTableSnapshot} from "./index.js";
it("exports the snapshot adapter",()=>{expect(typeof useTableSnapshot).toBe("function");});
