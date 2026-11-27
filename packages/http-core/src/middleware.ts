import type { HttpHeaders, HttpMiddleware, HttpRequest } from "./index.js";

const sensitiveHeaders = ["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key"];
const validHeaderValue = /^[\t\x20-\x7e]+$/;

function setHeader(headers: HttpHeaders | undefined, name: string, value: string): HttpHeaders {
  if (!validHeaderValue.test(value)) throw new TypeError("Invalid HTTP header value");
  return Object.fromEntries([
    ...Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() !== name),
    [name, value],
  ]);
}

export function withAuthorization(
  getAuthorization: (request: HttpRequest) => string | undefined | Promise<string | undefined>,
): HttpMiddleware {
  return async (request, next) => {
    const value = await getAuthorization(request);
    return next(value === undefined ? request : {
      ...request, headers: setHeader(request.headers, "authorization", value),
    });
  };
}

export function withCorrelationId(createId: () => string = () => globalThis.crypto.randomUUID()): HttpMiddleware {
  return async (request, next) => {
    const existing = Object.entries(request.headers ?? {}).find(([key]) => key.toLowerCase() === "x-request-id")?.[1];
    const id = existing && /^[A-Za-z0-9._-]{1,128}$/.test(existing) ? existing : createId();
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) throw new TypeError("Invalid correlation ID");
    const response = await next({ ...request, headers: setHeader(request.headers, "x-request-id", id) });
    return { ...response, headers: setHeader(response.headers, "x-request-id", id) };
  };
}

export function assertHttpTimeout(milliseconds: number): void {
  if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 2_147_483_647) {
    throw new RangeError("Invalid HTTP timeout");
  }
}

export function withHttpDeadline(milliseconds: number): HttpMiddleware {
  assertHttpTimeout(milliseconds);
  return async (request, next) => {
    const deadline = AbortSignal.timeout(milliseconds);
    const signal = request.signal ? AbortSignal.any([request.signal, deadline]) : deadline;
    signal.throwIfAborted();
    return next({ ...request, signal });
  };
}

export interface HttpBodySchema {
  safeParse(value: unknown):
    | { success: true; data: unknown }
    | { success: false; issues?: readonly unknown[]; error?: { issues: readonly unknown[] } };
}

export class HttpValidationError extends Error {
  constructor(readonly direction: "request" | "response", readonly issues: readonly unknown[]) {
    super(`HTTP ${direction} body validation failed`);
    this.name = "HttpValidationError";
  }
}

function parseBody(schema: HttpBodySchema, body: unknown, direction: "request" | "response") {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpValidationError(direction, result.issues ?? result.error?.issues ?? []);
  return result.data;
}

export function withHttpValidation(schemas: { request?: HttpBodySchema; response?: HttpBodySchema }): HttpMiddleware {
  return async (request, next) => {
    const validated = schemas.request
      ? { ...request, body: parseBody(schemas.request, request.body, "request") }
      : request;
    const response = await next(validated);
    return schemas.response
      ? { ...response, body: parseBody(schemas.response, response.body, "response") }
      : response;
  };
}

export function redactHttpHeaders(headers: HttpHeaders, additional: readonly string[] = []): HttpHeaders {
  const redacted = new Set([...sensitiveHeaders, ...additional.map(name => name.toLowerCase())]);
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name, redacted.has(name.toLowerCase()) ? "[REDACTED]" : value,
  ]));
}

export class HttpBodyLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super("HTTP body exceeded its byte limit");
    this.name = "HttpBodyLimitError";
  }
}

export function assertHttpBodyLimit(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError("Invalid HTTP body byte limit");
}

export function limitHttpBody(stream: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  assertHttpBodyLimit(maxBytes);
  let bytes = 0;
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new HttpBodyLimitError(maxBytes);
      controller.enqueue(chunk);
    },
  }));
}
