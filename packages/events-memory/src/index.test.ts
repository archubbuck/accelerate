import { describe,it,expect } from "vitest";
import { createMemoryEventBus } from "./index.js";
describe("memory events",()=>{it("delivers in order and supports unsubscribe",async()=>{const bus=createMemoryEventBus();const received:number[]=[];const off=bus.subscribe<{n:number}>("created",event=>{received.push(event.payload.n);});await bus.publish({id:"1",type:"created",payload:{n:1},occurredAt:new Date().toISOString()});off();await bus.publish({id:"2",type:"created",payload:{n:2},occurredAt:new Date().toISOString()});expect(received).toEqual([1]);});});
