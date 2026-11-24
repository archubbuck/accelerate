export type OperationMode = 'inspect'|'plan'|'preview'|'apply'|'verify';
export type OperationStatus = 'success'|'no-op'|'partial'|'failed'|'blocked'|'conflict'|'unsupported'|'requires-agent';
export interface Diagnostic { code: string; severity: 'error'|'warning'|'info'; message?: string; path?: string }
export interface OperationRequest { schemaVersion: '1.0'; operation: string; operationVersion: string; input: Record<string, unknown>; context?: Record<string, unknown>; options?: { mode?: OperationMode; atomic?: boolean; verify?: boolean } }
export type NormalizedRequest = Omit<OperationRequest,'options'> & {options: Required<NonNullable<OperationRequest['options']>>};
export interface OperationResult { status: OperationStatus; data?: Record<string, unknown>; changes?: unknown[]; diagnostics?: Diagnostic[]; verification?: unknown[]; artifacts?: unknown[]; nextOperations?: unknown[] }
export interface OperationResponse extends Required<OperationResult> { schemaVersion: '1.0'; operation: string; operationVersion: string }
export interface OperationManifest { id: string; version: string; package: string; description: string; mutatesProject: boolean; modes: OperationMode[]; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown> }
export type OperationHandler = (request: NormalizedRequest) => OperationResult | Promise<OperationResult>;
export const schemaVersion: '1.0';
export const modes: readonly OperationMode[];
export const statuses: readonly OperationStatus[];
export function validateRequest(request: unknown): Diagnostic[];
export function normalizeRequest(request: unknown): {ok:false;diagnostics:Diagnostic[]}|{ok:true;request:NormalizedRequest};
export function response(request: Pick<OperationRequest,'operation'|'operationVersion'>,status:OperationStatus,fields?:Omit<OperationResult,'status'>):OperationResponse;
export function validateSchemaDefinition(schema: unknown): boolean;
export function validateSchema(schema: unknown,value: unknown): boolean;
export function validateManifest(manifest: unknown): string[];
export class OperationRegistry {
 register(manifest: OperationManifest,handler: OperationHandler): void;
 list(): OperationManifest[];
 resolve(id:string,version:string): {manifest:OperationManifest;handler:OperationHandler}|undefined;
}
export function executeOperation(registry:OperationRegistry,request:unknown,options?:{validateSchema?:(schema:Record<string,unknown>,value:unknown)=>boolean|Promise<boolean>}):Promise<OperationResponse>;
