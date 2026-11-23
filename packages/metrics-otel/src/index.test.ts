import { describe,it,expect } from "vitest";
import { createOtelMeter } from "./index.js";
describe("otel metrics",()=>{it("supports instruments without SDK",()=>{const meter=createOtelMeter("accelerate-test");expect(()=>meter.counter("requests").add(1)).not.toThrow();expect(()=>meter.histogram("latency").record(10)).not.toThrow();});});
