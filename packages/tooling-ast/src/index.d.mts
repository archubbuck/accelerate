import type ts from 'typescript';
export interface TextEdit {start:number;end:number;expected:string;text:string}
export function applyTextEdits(source:string,edits:readonly TextEdit[]):string;
export interface ParseDiagnostic {code:number;start:number;length:number;message:string}
export function parseSource(fileName:string,source:string):{ast:ts.SourceFile;diagnostics:ParseDiagnostic[]};
export function findNodes(root:ts.Node,predicate:(node:ts.Node)=>boolean):ts.Node[];
export function transformSource(fileName:string,source:string,edits:readonly TextEdit[]):string;
export function ensureNamedImport(fileName:string,source:string,options:{moduleSpecifier:string;imported:string;local?:string}):string;
export function findSymbolReferences(files:Readonly<Record<string,string>>,fileName:string,position:number):{references:{fileName:string;start:number;end:number;text:string}[];resolved:boolean;complete:false};
export function planLocalRename(files:Readonly<Record<string,string>>,fileName:string,position:number,newName:string):{status:'success'|'no-op';edits:TextEdit[];source?:string;complete:false};
export interface SourceEditPlan {status:'success'|'no-op';edits:TextEdit[];source:string;complete:false}
export function rewriteImportModule(fileName:string,source:string,from:string,to:string):SourceEditPlan;
export function planUnusedImportRemoval(fileName:string,source:string,options:{moduleSpecifier:string;local:string}):SourceEditPlan;
export function planSourceTransforms(files:Readonly<Record<string,string>>,changes:readonly {fileName:string;edits:readonly TextEdit[]}[]):{status:'success'|'no-op';plans:{fileName:string;before:string;after:string}[];verification:{syntax:true;semantic:false}};
