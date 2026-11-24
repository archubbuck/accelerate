import {it,expect} from "vitest";import {toTableSignal} from "./index.js";
it("exports the snapshot adapter",()=>{expect(typeof toTableSignal).toBe("function");});
