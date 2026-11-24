import {it,expect} from "vitest";import {ModelError} from "./index.js";it("marks retryable failures explicitly",()=>expect(new ModelError("busy",true).retryable).toBe(true));
