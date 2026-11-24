import {it,expect} from "vitest";import {useFormSnapshot} from "./index.js";
it("exports the snapshot adapter",()=>{expect(typeof useFormSnapshot).toBe("function");});
