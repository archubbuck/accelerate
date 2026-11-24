import ts from 'typescript';
import {planReplacement} from '../../../tools/operations/patches.mjs';
import {applyTextEdits} from '../../../tools/operations/text-edits.mjs';
// Explicitly scoped candidate edits only; never claims complete or symbol-resolved rename.
export async function planUsageRename(root,{files,receivers,key,newKey}){
 if(!key.trim()||!newKey.trim()||key===newKey)return {status:'blocked',data:{complete:false},diagnostics:[{code:'INVALID_RENAME',severity:'error'}]};
 const changes=[],diagnostics=[];
 for(const file of [...new Set(files)].sort()){
  if(!/\.[cm]?tsx?$/.test(file))return {status:'unsupported',data:{complete:false},diagnostics:[{code:'UNSUPPORTED_SOURCE',severity:'error',path:file}]};
  const change=await planReplacement(root,file,source=>{
   const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
   if(ast.parseDiagnostics.length)throw new Error('SOURCE_PARSE_ERROR');
   const edits=[];
   function visit(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='enabled'&&ts.isIdentifier(node.expression.expression)&&receivers.includes(node.expression.expression.text)){
     const arg=node.arguments[0];
     if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))){
      if(arg.text===key){const start=arg.getStart(ast),end=arg.getEnd();edits.push({start,end,expected:source.slice(start,end),text:JSON.stringify(newKey)});}
     }else diagnostics.push({code:'DYNAMIC_FLAG_KEY',severity:'warning',path:file});
    }
    ts.forEachChild(node,visit);
   }
   visit(ast);
   return applyTextEdits(source,edits);
  });
  if(change)changes.push(change);
 }
 return {status:changes.length?'success':'no-op',data:{key,newKey,complete:false,symbolIdentityVerified:false},changes,diagnostics:[...diagnostics,{code:'REVIEW_REQUIRED',severity:'warning',message:'Candidate source edits only; registry and symbol identity are not verified.'}]};
}
