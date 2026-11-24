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
