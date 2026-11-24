export interface FileSnapshot {path:string;hash:string;content:string}
export interface Replacement {kind:'replace';path:string;beforeHash:string;afterHash:string;content:string}
export interface PatchDiagnostic {code:string;severity?:'error'|'warning';path?:string}
export function hashContent(content:string|Uint8Array):string;
export function resolveProjectFile(root:string,relative:string):Promise<string>;
export function snapshotFile(root:string,relative:string):Promise<FileSnapshot>;
export function planReplacement(root:string,relative:string,transform:(source:string)=>string|Promise<string>):Promise<Replacement|null>;
export function verifyPlan(root:string,changes:readonly Replacement[]):Promise<PatchDiagnostic[]>;
export function applyReplacements(root:string,changes:readonly Replacement[],options?:{apply?:boolean;verify?:()=>boolean|Promise<boolean>}):Promise<{status:'blocked'|'conflict'|'no-op'|'success'|'failed'|'partial';diagnostics:PatchDiagnostic[];verification?:{code:string;passed:boolean}[]}>;
