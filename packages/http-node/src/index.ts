import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import {
  assertHttpBodyLimit,
  HttpBodyLimitError,
  HttpValidationError,
  type HttpRequest,
  type HttpResponse,
} from "@accelerate/http-core";

export type NodeHttpHandler = (request: HttpRequest) => Promise<HttpResponse>;
export interface NodeHttpOptions {
  maxBodyBytes?: number;
  requestBody?: "buffered" | "stream";
}

function requestStream(req: IncomingMessage, limit: number, exceeded: () => void): ReadableStream<Uint8Array> {
  const chunks = req.iterator({ destroyOnReturn: false });
  let bytes = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) {
        controller.close();
        return;
      }
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > limit) {
        exceeded();
        void chunks.return?.().then(() => req.resume(), () => req.resume());
        controller.error(new HttpBodyLimitError(limit));
        return;
      }
      controller.enqueue(chunk);
    },
    async cancel() {
      try { await chunks.return?.(); } finally { req.resume(); }
    },
  }, { highWaterMark: 0 });
}

async function readBufferedBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const value of req.iterator({ destroyOnReturn: false })) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.byteLength;
    if (bytes > limit) {
      req.resume();
      throw new HttpBodyLimitError(limit);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8") || undefined;
}

function respondError(res: ServerResponse, status: number, code: string, message: string) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code, message } }));
}

export function createNodeHttpHandler(handler: NodeHttpHandler, options: NodeHttpOptions = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  assertHttpBodyLimit(maxBodyBytes);
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const disconnect = new AbortController();
    const abort = () => {
      if (!res.writableFinished) disconnect.abort(new Error("HTTP client disconnected"));
    };
    res.once("close", abort);
    let exceeded = false;
    let incoming: ReadableStream<Uint8Array> | undefined;
    try {
      if (Number(req.headers["content-length"]) > maxBodyBytes) {
        req.resume();
        throw new HttpBodyLimitError(maxBodyBytes);
      }
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers[key] = value;
        else if (Array.isArray(value)) headers[key] = value.join(", ");
      }
      const method = req.method ?? "GET";
      let body: string | ReadableStream<Uint8Array> | undefined;
      if (options.requestBody === "stream") {
        if (req.headers["transfer-encoding"] || Number(req.headers["content-length"]) > 0) {
          incoming = requestStream(req, maxBodyBytes, () => { exceeded = true; });
          body = incoming;
        }
      } else {
        body = await readBufferedBody(req, maxBodyBytes);
      }
      const result = await handler({ method, url: req.url ?? "/", headers, ...(body !== undefined ? { body } : {}), signal: disconnect.signal });
      if (exceeded) throw new HttpBodyLimitError(maxBodyBytes);
      const responseHeaders = { ...result.headers };
      const stream = result.body instanceof ReadableStream ? result.body : undefined;
      const omitBody = method === "HEAD" || result.status === 204 || result.status === 205 || result.status === 304;
      const payload = omitBody || stream || result.body === undefined
        ? undefined : typeof result.body === "string" ? result.body : JSON.stringify(result.body);
      if (payload !== undefined && typeof result.body !== "string"
        && !Object.keys(responseHeaders).some(key => key.toLowerCase() === "content-type")) {
        responseHeaders["content-type"] = "application/json; charset=utf-8";
      }
      res.writeHead(result.status, responseHeaders);
      if (stream && !omitBody) {
        const readable = Readable.fromWeb(stream as NodeReadableStream<Uint8Array>);
        await pipeline(readable, res, { signal: disconnect.signal });
      } else {
        res.end(payload);
        if (stream) await stream.cancel();
      }
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      if (exceeded || error instanceof HttpBodyLimitError) respondError(res, 413, "PAYLOAD_TOO_LARGE", "Request body too large");
      else if (error instanceof HttpValidationError && error.direction === "request") respondError(res, 400, "INVALID_BODY", "Request body validation failed");
      else respondError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
    } finally {
      res.off("close", abort);
      if (incoming && !incoming.locked && !req.readableEnded) {
        await incoming.cancel().catch(() => { req.resume(); });
      }
    }
  };
}
