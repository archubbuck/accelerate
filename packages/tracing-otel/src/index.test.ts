import { describe,it,expect } from "vitest";
import { createOtelTracer } from "./index.js";
describe("otel tracing",()=>{it("supports spans without SDK",()=>{const span=createOtelTracer("accelerate-test").startSpan("operation");expect(()=>{span.setAttribute("key","value");span.end();}).not.toThrow();});});
