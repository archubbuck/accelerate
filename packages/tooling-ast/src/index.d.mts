import type ts from 'typescript';
export interface TextEdit {start:number;end:number;expected:string;text:string}
export function applyTextEdits(source:string,edits:readonly TextEdit[]):string;
export interface ParseDiagnostic {code:number;start:number;length:number;message:string}
export function parseSource(fileName:string,source:string):{ast:ts.SourceFile;diagnostics:ParseDiagnostic[]};
export function findNodes(root:ts.Node,predicate:(node:ts.Node)=>boolean):ts.Node[];
export function transformSource(fileName:string,source:string,edits:readonly TextEdit[]):string;
export function ensureNamedImport(fileName:string,source:string,options:{moduleSpecifier:string;imported:string;local?:string}):string;
