import {it,expect} from "vitest";import {configField} from "@accelerate/config-core";import {createConfigToken} from "./index.js";
it("creates a provider for the typed token",()=>{const config=createConfigToken("app",{enabled:configField.boolean(false)});const provider=config.provide({enabled:true});expect(provider).toMatchObject({provide:config.token});});
