export type SpanAttributes = Readonly<Record<string, string | number | boolean>>;
export interface Span { setAttribute(key: string, value: string | number | boolean): void; recordException(error: unknown): void; end(): void; }
export interface Tracer { startSpan(name: string, attributes?: SpanAttributes): Span; }
export function noopTracer(): Tracer { return { startSpan: () => ({ setAttribute() {}, recordException() {}, end() {} }) }; }
export async function withSpan<T>(tracer: Tracer, name: string, operation: (span: Span) => Promise<T> | T): Promise<T> { const span = tracer.startSpan(name); try { return await operation(span); } catch (error) { span.recordException(error); throw error; } finally { span.end(); } }
