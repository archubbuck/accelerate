import {it,expect} from "vitest";import {toStoreSignal} from "./index.js";
it("exports the snapshot adapter",()=>{expect(typeof toStoreSignal).toBe("function");});
