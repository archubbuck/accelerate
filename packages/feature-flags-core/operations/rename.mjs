import {planReplacement} from '../../../tools/operations/patches.mjs';
import {planUsageRename} from './rename-usages.mjs';
export async function planFlagRename(root,input){
 const {target,key,newKey,files}=input;
 if(!key.trim()||!newKey.trim()||key===newKey||files.includes(target))return {status:'blocked',data:{complete:false},diagnostics:[{code:'INVALID_RENAME',severity:'error'}]};
 let issue;
 const registryChange=await planReplacement(root,target,source=>{
  const flags=JSON.parse(source);
  if(!Array.isArray(flags)||flags.some(f=>!f||typeof f.key!=='string'||typeof f.enabled!=='boolean')||new Set(flags.map(f=>f.key)).size!==flags.length)throw new Error('INVALID_REGISTRY');
  const flag=flags.find(f=>f.key===key);
  if(!flag){issue='FLAG_NOT_FOUND';return source;}
  if(flags.some(f=>f.key===newKey)){issue='FLAG_KEY_CONFLICT';return source;}
  flag.key=newKey;
  const indent=source.match(/\n([ \t]+)\{/)?.[1]??'  ';
  const newline=source.includes('\r\n')?'\r\n':'\n';
  return JSON.stringify(flags,null,indent).replace(/\n/g,newline)+(source.endsWith('\n')?newline:'');
 });
 if(issue)return {status:issue==='FLAG_KEY_CONFLICT'?'conflict':'unsupported',data:{complete:false},diagnostics:[{code:issue,severity:'error'}]};
 const usage=await planUsageRename(root,input);
 if(!['success','no-op'].includes(usage.status))return usage;
 return {status:'success',data:{key,newKey,complete:false,symbolIdentityVerified:false,applySupported:false},changes:[registryChange,...usage.changes],diagnostics:[...usage.diagnostics,{code:'RENAME_SCOPE_UNVERIFIED',severity:'warning',message:'Registry and candidate source edits must be reviewed together. Automatic application is disabled.'}]};
}
