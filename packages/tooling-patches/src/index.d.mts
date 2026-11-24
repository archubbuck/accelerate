export interface FileSnapshot {path:string;hash:string;content:string}
export interface Replacement {kind:'replace';path:string;beforeHash:string;afterHash:string;content:string}
export interface PatchDiagnostic {code:string;severity?:'error'|'warning';path?:string}
export function hashContent(content:string|Uint8Array):string;
export function resolveProjectFile(root:string,relative:string):Promise<string>;
export function snapshotFile(root:string,relative:string):Promise<FileSnapshot>;
export function planReplacement(root:string,relative:string,transform:(source:string)=>string|Promise<string>):Promise<Replacement|null>;
export function verifyPlan(root:string,changes:readonly Replacement[]):Promise<PatchDiagnostic[]>;
export function applyReplacements(root:string,changes:readonly Replacement[],options?:{apply?:boolean;verify?:()=>boolean|Promise<boolean>}):Promise<{status:'blocked'|'conflict'|'no-op'|'success'|'failed'|'partial';diagnostics:PatchDiagnostic[];verification?:{code:string;passed:boolean}[]}>;
export interface Creation {kind:'create';path:string;afterHash:string;content:string}
export interface Deletion {kind:'delete';path:string;beforeHash:string}
export interface Rename {kind:'rename';path:string;destination:string;beforeHash:string;afterHash:string}
export function resolveAbsentFile(root:string,relative:string):Promise<string>;
export function planCreation(root:string,relative:string,content:string):Promise<Creation>;
export function planDeletion(root:string,relative:string):Promise<Deletion>;
export function planRename(root:string,relative:string,destination:string):Promise<Rename>;
export type FilePatch = Creation | Replacement | Deletion | Rename;
export function verifyMixedPlan(root:string,changes:readonly FilePatch[]):Promise<PatchDiagnostic[]>;
export function applyMixedPlan(root:string,changes:readonly FilePatch[],options?:{apply?:boolean;verify?:()=>boolean|Promise<boolean>}):ReturnType<typeof applyReplacements>;
