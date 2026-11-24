import {it,expect} from "vitest";import {createNotifications} from "./index.js";
it("replaces duplicate ids and dismisses",()=>{const center=createNotifications();center.push({id:"1",message:"first",severity:"info"});center.push({id:"1",message:"second",severity:"success"});expect(center.getSnapshot()).toHaveLength(1);center.dismiss("1");expect(center.getSnapshot()).toEqual([]);});
