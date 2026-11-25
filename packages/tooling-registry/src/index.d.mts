export function validatePackageOperations(document:unknown,identity:{name:string;version:string}):string[];
export interface OperationEntry {manifest:{id:string;version:string;package:string;description:string;mutatesProject:boolean;modes:string[];inputSchema:unknown;outputSchema:unknown};handler:string;exportName:string}
export interface DiscoveredPackage {name:string;version:string;status:'declared'|'not-declared';operations:OperationEntry[]}
export function discoverPackageOperations(root:string,names:readonly string[]):Promise<{packages:DiscoveredPackage[];diagnostics:{package:string;code:string;errors?:string[]}[];handlersLoaded:false;trustVerified:false}>;
export interface CapabilityIndex {operations:(OperationEntry&{packageVersion:string})[];conflicts:string[]}
export function indexOperations(packages:readonly DiscoveredPackage[]):CapabilityIndex;
export function searchOperations(index:CapabilityIndex,options?:{query?:string;packageName?:string;mode?:string}):CapabilityIndex['operations'];
export function resolveOperation(index:CapabilityIndex,request:{id:string;operationVersion:string;packageName:string;packageVersion:string}):{status:'conflict'|'not-found'|'incompatible'}|{status:'resolved';entry:CapabilityIndex['operations'][number]};
export interface ResolutionRequest {id:string;operationVersion:string;packageName:string;packageVersion:string}
export type HandlerEvidence={status:'inspected';entry:CapabilityIndex['operations'][number];sha256:string;manifestSha256:string;handlersLoaded:false;trustVerified:false}|{status:'blocked'|'conflict'|'not-found'|'incompatible';diagnostics:{package:string;code:string;errors?:string[]}[]};
export function inspectHandlerIntegrity(root:string,request:ResolutionRequest):Promise<HandlerEvidence>;
export function authorizeHandler(evidence:HandlerEvidence,approval:ResolutionRequest&{allowExecution:boolean;handler:string;exportName:string;sha256:string;manifestSha256:string}):boolean;
export function loadApprovedHandler(root:string,request:ResolutionRequest,approval:Parameters<typeof authorizeHandler>[1]):Promise<{status:'blocked';code:string}|{status:'loaded';manifest:OperationEntry['manifest'];handler:(...args:unknown[])=>unknown;isolated:false}>;
export function executeApprovedOperation(root:string,request:unknown,approval:Parameters<typeof authorizeHandler>[1]):Promise<{status:'blocked';code:string}|{status:'executed';result:unknown}>;
