#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createBuiltinRegistry,executeBuiltin} from './builtins.mjs';
import {applyReplacements} from './apply.mjs';
const args=process.argv.slice(2);
async function main(){
 const command=args.shift();
 const rootIndex=args.indexOf('--root');
 let root=process.cwd();
 if(rootIndex!==-1){if(!args[rootIndex+1])throw new Error('ROOT_REQUIRED');root=args[rootIndex+1];args.splice(rootIndex,2);}
 if(command==='list'&&args.length===0)return {status:'success',data:(await createBuiltinRegistry(root)).list()};
 if(command==='describe'&&args.length===1){
  const matches=(await createBuiltinRegistry(root)).list().filter(m=>m.id===args[0]);
  return {status:matches.length?'success':'unsupported',data:matches};
 }
 if(command==='execute'&&args.length===1){
  const request=JSON.parse(await readFile(args[0],'utf8'));
  return executeBuiltin(root,request);
 }
 // Apply a previously reviewed plan, not an implicitly regenerated one.
 if(command==='apply-plan'&&args.length===2&&args[1]==='--apply'){
  const plan=JSON.parse(await readFile(args[0],'utf8'));
  if(plan.schemaVersion!=='1.0'||!['feature-flags.register','feature-flags.update'].includes(plan.operation)||plan.operationVersion!=='1.0.0'||plan.status!=='success'||!Array.isArray(plan.changes)||plan.changes.length!==1)throw new Error('INVALID_PLAN');
  const change=plan.changes[0];
  const expected=await executeBuiltin(root,{schemaVersion:'1.0',operation:plan.operation,operationVersion:plan.operationVersion,input:{target:change.path,key:plan.data?.key,enabled:plan.data?.enabled}});
  if(expected.status!=='success'||JSON.stringify(expected.changes)!==JSON.stringify(plan.changes))return {status:'conflict',diagnostics:[{code:'PLAN_MISMATCH'}]};
  return applyReplacements(root,expected.changes,{apply:true});
 }
 throw new Error('USAGE: list | describe ID | execute REQUEST.json | apply-plan PLAN.json --apply [--root PATH]');
}
try{
 const result=await main();
 console.log(JSON.stringify(result,null,2));
 process.exitCode=['success','no-op'].includes(result.status)?0:1;
}catch{
 console.log(JSON.stringify({status:'failed',diagnostics:[{code:'CLI_FAILED',message:'Invalid arguments, unreadable input or execution failure. See operation documentation.'}]}));
 process.exitCode=1;
}
