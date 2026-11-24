import {it,expect} from "vitest";import {configField} from "@accelerate/config-core";import {createConfigContext} from "./index.js";
it("creates a typed provider and hook",()=>{const context=createConfigContext({enabled:configField.boolean(false)});expect(typeof context.Provider).toBe("function");expect(typeof context.useConfig).toBe("function");});
