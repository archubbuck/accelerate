import ts from 'typescript';
// Apply nonoverlapping AST-derived text edits without reprinting unrelated source.
export function applyTextEdits(source,edits){
 const ordered=[...edits].sort((a,b)=>a.start-b.start||a.end-b.end);
 let cursor=0,result='';
 for(const edit of ordered){
  if(!Number.isInteger(edit.start)||!Number.isInteger(edit.end)||edit.start<cursor||edit.end<edit.start||edit.end>source.length||typeof edit.text!=='string'||source.slice(edit.start,edit.end)!==edit.expected)throw new Error('INVALID_OR_STALE_TEXT_EDIT');
  result+=source.slice(cursor,edit.start)+edit.text;
  cursor=edit.end;
 }
 return result+source.slice(cursor);
}

export function parseSource(fileName,source){
 if(typeof fileName!=='string'||typeof source!=='string'||! /\.[cm]?[jt]sx?$/.test(fileName))throw new Error('UNSUPPORTED_SOURCE');
 const ast=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true);
 const diagnostics=ast.parseDiagnostics.map(d=>({code:d.code,start:d.start??0,length:d.length??0,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
 return {ast,diagnostics};
}
export function findNodes(root,predicate){
 const matches=[];
 function visit(node){if(predicate(node))matches.push(node);ts.forEachChild(node,visit);}
 visit(root);return matches;
}
export function transformSource(fileName,source,edits){
 if(parseSource(fileName,source).diagnostics.length)throw new Error('SOURCE_PARSE_ERROR');
 const result=applyTextEdits(source,edits);
 if(parseSource(fileName,result).diagnostics.length)throw new Error('TRANSFORM_PARSE_ERROR');
 return result;
}
