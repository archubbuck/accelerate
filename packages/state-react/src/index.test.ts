import {it,expect} from "vitest";import {useStoreSnapshot} from "./index.js";
it("exports the snapshot adapter",()=>{expect(typeof useStoreSnapshot).toBe("function");});
