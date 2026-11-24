import {it,expect} from "vitest";import {checkBoundaries,findCycles} from "./index.js";
it("detects cycles and forbidden dependencies",()=>{const edges=[{from:"core",to:"ui"},{from:"ui",to:"core"}];expect(findCycles(edges)).toEqual([["core","ui","core"]]);expect(checkBoundaries(edges,[{name:"core independent",allows:e=>e.from!=="core"}])).toHaveLength(1);});
