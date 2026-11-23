import { normalizeHeaders, type HttpRequest, type HttpResponse, type HttpTransport } from "@accelerate/http-core";
export interface FetchClientOptions { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number; }
export class HttpStatusError extends Error {
 constructor(readonly response: HttpResponse) { super(`HTTP request failed with status ${response.status}`); this.name = "HttpStatusError"; }
}
export function createHttpClient(options: FetchClientOptions = {}): HttpTransport {
 const fetcher = options.fetch ?? globalThis.fetch;
 if (!fetcher) throw new Error("fetch is not available");
 if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) throw new RangeError("Invalid timeoutMs");
 return { async send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
  const url = options.baseUrl ? new URL(request.url, options.baseUrl).toString() : request.url;
  const headers = new Headers(request.headers);
  let body: BodyInit | undefined;
  if (request.body !== undefined) {
   if (typeof request.body === "string" || request.body instanceof Blob || request.body instanceof FormData || request.body instanceof URLSearchParams || request.body instanceof ArrayBuffer) body = request.body;
   else { body = JSON.stringify(request.body); if (!headers.has("content-type")) headers.set("content-type","application/json"); }
  }
  const signal = options.timeoutMs === undefined ? request.signal : AbortSignal.any([...(request.signal ? [request.signal] : []), AbortSignal.timeout(options.timeoutMs)]);
  const response = await fetcher(url,{method:request.method,headers,body,signal});
  const raw = response.status === 204 || response.status === 205 || request.method.toUpperCase() === "HEAD" ? "" : await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const parsed: unknown = raw && (contentType.toLowerCase().includes("application/json") || contentType.toLowerCase().includes("+json")) ? JSON.parse(raw) : raw || undefined;
  return {status:response.status,headers:normalizeHeaders(response.headers),body:parsed as T};
 }};
}
