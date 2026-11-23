import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpRequest, HttpResponse } from "@accelerate/http-core";
export type NodeHttpHandler = (request: HttpRequest) => Promise<HttpResponse>;
export interface NodeHttpOptions { maxBodyBytes?: number; }
export function createNodeHttpHandler(handler: NodeHttpHandler, options: NodeHttpOptions = {}) {
 const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
 if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 0) throw new RangeError("Invalid maxBodyBytes");
 return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
   const chunks: Buffer[] = []; let bytes = 0;
   for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBodyBytes) { res.writeHead(413,{"content-type":"application/json"}); res.end(JSON.stringify({error:{code:"PAYLOAD_TOO_LARGE",message:"Request body too large"}})); return; }
    chunks.push(buffer);
   }
   const raw = Buffer.concat(chunks).toString("utf8");
   const headers: Record<string,string> = {};
   for (const [key,value] of Object.entries(req.headers)) if (typeof value === "string") headers[key] = value; else if (Array.isArray(value)) headers[key] = value.join(", ");
   const result = await handler({method:req.method ?? "GET",url:req.url ?? "/",headers,...(raw ? {body:raw}:{}),signal:undefined});
   const responseHeaders: Record<string,string> = {...result.headers};
   if (result.body !== undefined && typeof result.body !== "string" && !Object.keys(responseHeaders).some(key=>key.toLowerCase()==="content-type")) responseHeaders["content-type"]="application/json; charset=utf-8";
   res.writeHead(result.status,responseHeaders);
   res.end(req.method === "HEAD" || result.body === undefined ? undefined : typeof result.body === "string" ? result.body : JSON.stringify(result.body));
  } catch {
   if (res.headersSent) {res.destroy(); return;}
   res.writeHead(500,{"content-type":"application/json"});
   res.end(JSON.stringify({error:{code:"INTERNAL_ERROR",message:"An unexpected error occurred"}}));
  }
 };
}
