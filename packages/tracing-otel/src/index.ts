import { trace } from "@opentelemetry/api";
import type { Tracer } from "@accelerate/tracing-core";
export function createOtelTracer(name: string, version?: string): Tracer { const tracer=trace.getTracer(name,version); return { startSpan(spanName,attributes) { const span=tracer.startSpan(spanName,{attributes}); return { setAttribute:(key,value)=>{span.setAttribute(key,value);}, recordException:error=>{span.recordException(error instanceof Error?error:String(error));}, end:()=>{span.end();} }; } }; }
