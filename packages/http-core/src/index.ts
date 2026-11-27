export type HttpHeaders = Readonly<Record<string,string>>;
export interface HttpRequest<T = unknown> { method: string; url: string; headers?: HttpHeaders; body?: T; signal?: AbortSignal; }
export interface HttpResponse<T = unknown> { status: number; headers: HttpHeaders; body: T; }
export interface HttpTransport { send<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>; }
export type HttpMiddleware = (request: HttpRequest, next: (request: HttpRequest) => Promise<HttpResponse>) => Promise<HttpResponse>;
export function composeMiddleware(transport: HttpTransport, middleware: readonly HttpMiddleware[]): HttpTransport {
  return { send: <T>(request: HttpRequest): Promise<HttpResponse<T>> => {
    const dispatch = (index: number, current: HttpRequest): Promise<HttpResponse> =>
      index === middleware.length ? transport.send(current) : middleware[index]!(current, next => dispatch(index + 1, next));
    return dispatch(0, request) as Promise<HttpResponse<T>>;
  }};
}
export function normalizeHeaders(headers: Headers): HttpHeaders { return (() => { const result: Record<string,string> = {}; headers.forEach((value,key) => { result[key] = value; }); return result; })(); }

export * from "./middleware.js";
