import { normalizeHeaders, type HttpRequest, type HttpResponse, type HttpTransport } from "@accelerate/http-core";
export interface FetchClientOptions { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number; }
export function createHttpClient(options: FetchClientOptions = {}): HttpTransport {
  const fetcher = options.fetch ?? fetch;
  return { async send<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const url = options.baseUrl ? new URL(request.url, options.baseUrl).toString() : request.url;
    const response = await fetcher(url, {
      method: request.method, headers: request.headers,
      ...(request.body === undefined ? {} : { body: typeof request.body === "string" ? request.body : JSON.stringify(request.body) }),
      signal: options.timeoutMs === undefined ? request.signal : AbortSignal.any([...(request.signal ? [request.signal] : []), AbortSignal.timeout(options.timeoutMs)])
    });
    const text = await response.text();
    let body: unknown = text;
    if (response.headers.get("content-type")?.includes("json") && text) body = JSON.parse(text);
    return { status: response.status, headers: normalizeHeaders(response.headers), body: body as T };
  }};
}
