import ts from 'typescript';
import {planReplacement} from '../../../tools/operations/patches.mjs';
import {applyTextEdits} from '../../../tools/operations/text-edits.mjs';
export async function planRetirement(root,{target,key,files,receivers,retainBehavior}){
 const changes=[],issues=[];
 const blocked=()=>({status:'blocked',data:{key,complete:false,applySupported:false},diagnostics:issues});
 if(!files.length||!receivers.length||files.includes(target)){issues.push({code:'INVALID_SCOPE',severity:'error'});return blocked();}
 for(const file of [...new Set(files)].sort()){
  if(!/\.[cm]?tsx?$/.test(file)){issues.push({code:'UNSUPPORTED_SOURCE',severity:'error',path:file});continue;}
  const change=await planReplacement(root,file,source=>{
   const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
   if(ast.parseDiagnostics.length){issues.push({code:'SOURCE_PARSE_ERROR',severity:'error',path:file});return source;}
   const edits=[];
   function visit(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='enabled'&&ts.isIdentifier(node.expression.expression)&&receivers.includes(node.expression.expression.text)){
     const arg=node.arguments[0];
     if(!arg||!(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)))issues.push({code:'DYNAMIC_FLAG_KEY',severity:'error',path:file});
     else if(arg.text===key){
      const awaited=node.parent,conditional=awaited.parent;
      if(!ts.isAwaitExpression(awaited)||!ts.isIfStatement(conditional)||conditional.expression!==awaited||node.arguments.length!==1||!ts.isBlock(conditional.thenStatement)||(conditional.elseStatement&&!ts.isBlock(conditional.elseStatement))){
       issues.push({code:'UNSUPPORTED_RETIREMENT_PATTERN',severity:'error',path:file});
      }else{
       const branch=retainBehavior==='enabled'?conditional.thenStatement:conditional.elseStatement;
       const start=conditional.getStart(ast),end=conditional.getEnd();
       edits.push({start,end,expected:source.slice(start,end),text:branch?branch.getText(ast):'{}'});
      }
     }
    }
    ts.forEachChild(node,visit);
   }
   visit(ast);
   if(issues.length)return source;
   try{return applyTextEdits(source,edits);}catch{issues.push({code:'OVERLAPPING_RETIREMENT_EDITS',severity:'error',path:file});return source;}
  });
  if(change)changes.push(change);
 }
 if(issues.length)return blocked();
 let found=false;
 const registry=await planReplacement(root,target,source=>{
  const flags=JSON.parse(source);
  if(!Array.isArray(flags)||flags.some(f=>!f||typeof f.key!=='string'||typeof f.enabled!=='boolean')||new Set(flags.map(f=>f.key)).size!==flags.length)throw new Error('INVALID_REGISTRY');
  found=flags.some(f=>f.key===key);
  return found?JSON.stringify(flags.filter(f=>f.key!==key),null,2)+(source.endsWith('\n')?'\n':''):source;
 });
 if(!found){issues.push({code:'FLAG_NOT_FOUND',severity:'error'});return blocked();}
 return {status:'success',data:{key,retainBehavior,complete:false,applySupported:false},changes:[registry,...changes],diagnostics:[{code:'RETIREMENT_REVIEW_REQUIRED',severity:'warning',message:'Candidate edits only; symbol identity, receiver side effects and exhaustive usage coverage are unverified.'}]};
}
