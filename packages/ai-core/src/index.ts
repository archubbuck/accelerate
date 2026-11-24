export interface ToolCall {readonly id:string;readonly name:string;readonly arguments:unknown;}
export type Message={readonly role:"system"|"user";readonly content:string}|{readonly role:"assistant";readonly content:string;readonly toolCalls?:readonly ToolCall[]}|{readonly role:"tool";readonly content:string;readonly toolCallId:string};
export interface Usage {readonly inputTokens:number;readonly outputTokens:number;}
export interface ToolDefinition {readonly name:string;readonly description:string;readonly inputSchema:Readonly<Record<string,unknown>>;}
export interface ModelRequest {readonly model:string;readonly messages:readonly Message[];readonly tools?:readonly ToolDefinition[];readonly signal?:AbortSignal;readonly maxOutputTokens?:number;}
export interface ModelResponse {readonly content:string;readonly toolCalls?:readonly ToolCall[];readonly usage?:Usage;}
export interface ModelProvider {generate(request:ModelRequest):Promise<ModelResponse>;}
export class ModelError extends Error {constructor(message:string,readonly retryable=false,options?:ErrorOptions){super(message,options);this.name="ModelError";}}
