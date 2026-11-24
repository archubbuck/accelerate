import {planReplacement} from '../../../tools/operations/patches.mjs';
import {findFlagUsages} from './usages.mjs';
export async function planFlagRemoval(root,{target,key,files,receivers}){
 const scan=await findFlagUsages(root,{files,receivers,key});
 const data={key,complete:false,applySupported:false};
 if(scan.status!=='success'||scan.data.usages.length||scan.data.unresolved.length)return {status:'blocked',data:{...data,usages:scan.data.usages,unresolved:scan.data.unresolved},diagnostics:[...scan.diagnostics,{code:'REMOVAL_REFERENCES_UNRESOLVED',severity:'error'}]};
 let found=false;
 const change=await planReplacement(root,target,source=>{
  const flags=JSON.parse(source);
  if(!Array.isArray(flags)||flags.some(f=>!f||typeof f.key!=='string'||typeof f.enabled!=='boolean')||new Set(flags.map(f=>f.key)).size!==flags.length)throw new Error('INVALID_REGISTRY');
  found=flags.some(f=>f.key===key);
  if(!found)return source;
  const indent=source.match(/\n([ \t]+)\{/)?.[1]??'  ';
  const newline=source.includes('\r\n')?'\r\n':'\n';
  return JSON.stringify(flags.filter(f=>f.key!==key),null,indent).replace(/\n/g,newline)+(source.endsWith('\n')?newline:'');
 });
 return {status:found?'success':'no-op',data,changes:change?[change]:[],diagnostics:[{code:'REMOVAL_SCOPE_UNVERIFIED',severity:'warning',message:'No references detected in supplied scope; this does not establish safe removal. Preview only.'}]};
}
