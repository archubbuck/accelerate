import {it,expect} from "vitest";import {createForm} from "./index.js";
it("validates changes and resets",async()=>{const form=createForm({name:""},v=>v.name?{}:{name:"Required"});expect(form.getSnapshot().valid).toBe(false);form.set("name","Ada");expect(await form.submit(async v=>v.name)).toBe("Ada");form.reset();expect(form.getSnapshot().valid).toBe(false);});
