import ts from 'typescript';
import {parseSource,findNodes} from '../../tooling-ast/src/index.mjs';
import {snapshotFile} from '../../../tools/operations/patches.mjs';
// Only calls on explicitly identified receiver identifiers are candidates.
// This is syntactic evidence, not proof of symbol identity or exhaustive usage.
export async function findFlagUsages(root,{files,receivers,key}){
 const usages=[],unresolved=[],diagnostics=[];
 for(const file of [...new Set(files)].sort()){
  const {content}=await snapshotFile(root,file);
  if(!/\.[cm]?tsx?$/.test(file)){diagnostics.push({code:'UNSUPPORTED_SOURCE',severity:'warning',path:file});continue;}
  const {ast:source,diagnostics:parseDiagnostics}=parseSource(file,content);
  if(parseDiagnostics.length){diagnostics.push({code:'SOURCE_PARSE_ERROR',severity:'error',path:file});continue;}
  for(const node of findNodes(source,node=>ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='enabled'&&ts.isIdentifier(node.expression.expression)&&receivers.includes(node.expression.expression.text))){
    const arg=node.arguments[0];
    const pos=source.getLineAndCharacterOfPosition(node.getStart(source));
    const location={path:file,line:pos.line+1,column:pos.character+1,receiver:node.expression.expression.text};
    if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))){if(key===undefined||arg.text===key)usages.push({...location,key:arg.text});}
    else unresolved.push(location);
  }
 }
 return {status:diagnostics.some(d=>d.severity==='error')?'partial':'success',data:{usages,unresolved,complete:false,evidence:'syntactic receiver match',limitations:['Explicit files only','No symbol resolution, aliases, templates or dynamic key resolution']},diagnostics};
}
