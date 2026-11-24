import {it,expect} from "vitest";import {toFormSignal} from "./index.js";
it("exports the snapshot adapter",()=>{expect(typeof toFormSignal).toBe("function");});
