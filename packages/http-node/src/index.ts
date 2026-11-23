import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpRequest, HttpResponse } from "@accelerate/http-core";
export type NodeHttpHandler = (request: HttpRequest) => Promise<HttpResponse>;
export function createNodeHttpHandler(handler: NodeHttpHandler) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      const result = await handler({ method: req.method ?? "GET", url: req.url ?? "/", headers: Object.fromEntries(Object.entries(req.headers).filter((entry): entry is [string,string] => typeof entry[1] === "string")), ...(raw ? {body:raw} : {}) });
      res.writeHead(result.status, result.headers);
      res.end(result.body === undefined ? undefined : typeof result.body === "string" ? result.body : JSON.stringify(result.body));
    } catch {
      if (!res.headersSent) res.writeHead(500, {"content-type":"application/json"});
      res.end(JSON.stringify({error:{code:"INTERNAL_ERROR",message:"An unexpected error occurred"}}));
    }
  };
}
