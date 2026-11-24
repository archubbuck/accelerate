export function validatePackageOperations(document:unknown,identity:{name:string;version:string}):string[];
export interface OperationEntry {manifest:{id:string;version:string;package:string;description:string;mutatesProject:boolean;modes:string[];inputSchema:unknown;outputSchema:unknown};handler:string;exportName:string}
export interface DiscoveredPackage {name:string;version:string;status:'declared'|'not-declared';operations:OperationEntry[]}
export function discoverPackageOperations(root:string,names:readonly string[]):Promise<{packages:DiscoveredPackage[];diagnostics:{package:string;code:string;errors?:string[]}[];handlersLoaded:false;trustVerified:false}>;
export interface CapabilityIndex {operations:(OperationEntry&{packageVersion:string})[];conflicts:string[]}
export function indexOperations(packages:readonly DiscoveredPackage[]):CapabilityIndex;
export function searchOperations(index:CapabilityIndex,options?:{query?:string;packageName?:string;mode?:string}):CapabilityIndex['operations'];
export function resolveOperation(index:CapabilityIndex,request:{id:string;operationVersion:string;packageName:string;packageVersion:string}):{status:'conflict'|'not-found'|'incompatible'}|{status:'resolved';entry:CapabilityIndex['operations'][number]};
