import ts from 'typescript';
import {planReplacement} from '../../../tools/operations/patches.mjs';
import {applyTextEdits} from '../../../tools/operations/text-edits.mjs';
import {planFlagRegistration} from './register.mjs';
// Explicit narrow integration: wrap a unique awaited zero-argument call in an async function.
export async function planIntegration(root,{file,key,receiver,enabledCall,disabledCall}){
 const identifier=/^[A-Za-z_$][\w$]*$/;
 const blocked=code=>({status:'blocked',data:{key,applySupported:false},diagnostics:[{code,severity:'error'}]});
 if(![receiver,enabledCall,disabledCall].every(x=>identifier.test(x))||enabledCall===disabledCall||!key.trim()||!/\.[cm]?tsx?$/.test(file))return blocked('INVALID_INTEGRATION_TARGET');
 let issue;
 const change=await planReplacement(root,file,source=>{
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  if(ast.parseDiagnostics.length){issue='SOURCE_PARSE_ERROR';return source;}
  const matches=[];
  function visit(node){
   if(ts.isExpressionStatement(node)&&ts.isAwaitExpression(node.expression)){
    const call=node.expression.expression;
    if(ts.isCallExpression(call)&&ts.isIdentifier(call.expression)&&call.expression.text===disabledCall&&call.arguments.length===0)matches.push(node);
   }
   ts.forEachChild(node,visit);
  }
  visit(ast);
  if(matches.length!==1){issue='AMBIGUOUS_INTEGRATION_TARGET';return source;}
  const node=matches[0];
  let parent=node.parent;
  while(parent&&!ts.isFunctionLike(parent))parent=parent.parent;
  if(!parent||!parent.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)){issue='ASYNC_CONTEXT_REQUIRED';return source;}
  const start=node.getStart(ast),end=node.getEnd();
  const text='if (await '+receiver+'.enabled('+JSON.stringify(key)+')) { await '+enabledCall+'(); } else { '+source.slice(start,end)+' }';
  return applyTextEdits(source,[{start,end,expected:source.slice(start,end),text}]);
 });
 if(issue)return blocked(issue);
 return {status:change?'success':'no-op',data:{key,applySupported:false,symbolIdentityVerified:false},changes:change?[change]:[],diagnostics:[{code:'INTEGRATION_REVIEW_REQUIRED',severity:'warning',message:'Receiver and branch function bindings must be verified before application.'}]};
}
export async function planCreation(root,input){
 if(input.target===input.file)return {status:'blocked',data:{applySupported:false},diagnostics:[{code:'OVERLAPPING_TARGETS',severity:'error'}]};
 const registration=await planFlagRegistration(root,input);
 const integration=await planIntegration(root,input);
 if(!['success','no-op'].includes(integration.status))return integration;
 return {status:'success',data:{key:input.key,applySupported:false,runtimeWiringVerified:false},changes:[...registration.changes,...integration.changes],diagnostics:[...registration.diagnostics,...integration.diagnostics]};
}
