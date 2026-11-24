import {it,expect} from "vitest";import {Secrets,MissingSecretError} from "./index.js";
it("returns configured values and rejects missing secrets",async()=>{const secrets=new Secrets({get:async key=>key==="present"?"value":undefined});expect(await secrets.require("present")).toBe("value");await expect(secrets.require("missing")).rejects.toBeInstanceOf(MissingSecretError);});
