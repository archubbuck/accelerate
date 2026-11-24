import {snapshotFile,planReplacement} from '../../../tools/operations/patches.mjs';
function parse(source){
 const flags=JSON.parse(source);
 if(!Array.isArray(flags)||flags.some(f=>!f||typeof f.key!=='string'||typeof f.enabled!=='boolean')||new Set(flags.map(f=>f.key)).size!==flags.length)throw new Error('UNSUPPORTED_FLAG_REGISTRY');
 return flags;
}
export async function listFlags(root,{target}){
 const flags=parse((await snapshotFile(root,target)).content);
 return {status:'success',data:{flags:flags.map(({key,enabled})=>({key,enabled})).sort((a,b)=>a.key.localeCompare(b.key,'en')),runtimeWiringVerified:false}};
}
export async function planFlagUpdate(root,{target,key,enabled}){
 let found=false;
 const change=await planReplacement(root,target,source=>{
  const flags=parse(source);
  const flag=flags.find(f=>f.key===key);
  if(!flag)return source;
  found=true;
  if(flag.enabled===enabled)return source;
  flag.enabled=enabled;
  const indent=source.match(/\n([ \t]+)\{/)?.[1]??'  ';
  const newline=source.includes('\r\n')?'\r\n':'\n';
  return JSON.stringify(flags,null,indent).replace(/\n/g,newline)+(source.endsWith('\n')?newline:'');
 });
 return {status:!found?'unsupported':change?'success':'no-op',data:{key,enabled,found,runtimeWiringVerified:false},changes:change?[change]:[],diagnostics:!found?[{code:'FLAG_NOT_FOUND',severity:'error'}]:[]};
}

export async function describeFlag(root,{target,key}){
 const flags=parse((await snapshotFile(root,target)).content);
 const flag=flags.find(f=>f.key===key);
 return flag?{status:'success',data:{flag,runtimeWiringVerified:false}}:{status:'unsupported',data:{key},diagnostics:[{code:'FLAG_NOT_FOUND',severity:'error'}]};
}
export async function validateFlags(root,{target}){
 try{
  const flags=parse((await snapshotFile(root,target)).content);
  const issues=[];
  for(const flag of flags){
   if(!flag.key.trim())issues.push({code:'EMPTY_FLAG_KEY',severity:'error'});
   if(flag.rules!==undefined&&(!Array.isArray(flag.rules)||flag.rules.some(r=>!r||typeof r.attribute!=='string'||typeof r.equals!=='string'||typeof r.enabled!=='boolean')))issues.push({code:'INVALID_FLAG_RULES',severity:'error',key:flag.key});
  }
  return {status:issues.length?'failed':'success',data:{count:flags.length,valid:!issues.length,runtimeWiringVerified:false},diagnostics:issues};
 }catch{return {status:'failed',data:{valid:false,runtimeWiringVerified:false},diagnostics:[{code:'INVALID_OR_UNREADABLE_REGISTRY',severity:'error'}]};}
}
