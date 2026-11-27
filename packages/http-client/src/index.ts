import {
  assertHttpBodyLimit,
  assertHttpTimeout,
  limitHttpBody,
  normalizeHeaders,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from "@accelerate/http-core";

export interface FetchClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  responseBody?: "buffered" | "stream";
  maxResponseBytes?: number;
}

export class HttpStatusError extends Error {
  constructor(readonly response: HttpResponse) {
    super(`HTTP request failed with status ${response.status}`);
    this.name = "HttpStatusError";
  }
}

function encodeBody(value: unknown, headers: Headers): BodyInit | undefined {
  if (value === undefined || typeof value === "string" || value instanceof Blob
    || value instanceof FormData || value instanceof URLSearchParams
    || value instanceof ArrayBuffer || value instanceof ReadableStream) return value;
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return JSON.stringify(value);
}

export function createHttpClient(options: FetchClientOptions = {}): HttpTransport {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error("fetch is not available");
  if (options.timeoutMs !== undefined) assertHttpTimeout(options.timeoutMs);
  if (options.maxResponseBytes !== undefined) assertHttpBodyLimit(options.maxResponseBytes);
  return {
    async send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
      const url = options.baseUrl ? new URL(request.url, options.baseUrl).toString() : request.url;
      const headers = new Headers(request.headers);
      const body = encodeBody(request.body, headers);
      const deadline = options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs);
      const signal = deadline && request.signal ? AbortSignal.any([request.signal, deadline]) : deadline ?? request.signal;
      const init: RequestInit & { duplex?: "half" } = { method: request.method, headers, body, signal };
      if (body instanceof ReadableStream) init.duplex = "half";
      const response = await fetcher(url, init);
      const responseHeaders = normalizeHeaders(response.headers);
      const result = (value: unknown): HttpResponse<T> => ({ status: response.status, headers: responseHeaders, body: value as T });
      if (response.status === 204 || response.status === 205 || request.method.toUpperCase() === "HEAD") return result(undefined);
      const stream = response.body && options.maxResponseBytes !== undefined
        ? limitHttpBody(response.body, options.maxResponseBytes) : response.body;
      if (options.responseBody === "stream") return result(stream ?? undefined);
      const raw = stream === response.body ? await response.text() : await new Response(stream).text();
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      return result(raw && (contentType.includes("application/json") || contentType.includes("+json"))
        ? JSON.parse(raw) : raw || undefined);
    },
  };
}
