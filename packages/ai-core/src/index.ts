export interface ToolCall {readonly id:string;readonly name:string;readonly arguments:unknown;}
export type Message={readonly role:"system"|"user";readonly content:string}|{readonly role:"assistant";readonly content:string;readonly toolCalls?:readonly ToolCall[]}|{readonly role:"tool";readonly content:string;readonly toolCallId:string};
export interface Usage {readonly inputTokens:number;readonly outputTokens:number;}
export interface ToolDefinition {readonly name:string;readonly description:string;readonly inputSchema:Readonly<Record<string,unknown>>;}
export interface NativeStructuredOutput {
  readonly schemaId: string;
  readonly schemaVersion: string;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
}
export interface ModelRequest {readonly model:string;readonly messages:readonly Message[];readonly tools?:readonly ToolDefinition[];readonly signal?:AbortSignal;readonly maxOutputTokens?:number;readonly structuredOutput?:NativeStructuredOutput;}
export interface ModelResponse {readonly content:string;readonly toolCalls?:readonly ToolCall[];readonly usage?:Usage;readonly structuredOutputMode?:"native"|"prompt";}
export interface ModelProvider {generate(request:ModelRequest):Promise<ModelResponse>;supportsStructuredOutput?(model:string):boolean|Promise<boolean>;}
export class ModelError extends Error {constructor(message:string,readonly retryable=false,options?:ErrorOptions){super(message,options);this.name="ModelError";}}
