import {listFlags} from './lifecycle.mjs';
import {findFlagUsages} from './usages.mjs';
export async function compareFlagUsage(root,{target,files,receivers},kind){
 const inventory=await listFlags(root,{target});
 const scan=await findFlagUsages(root,{files,receivers});
 const registered=new Set(inventory.data.flags.map(f=>f.key));
 const used=new Set(scan.data.usages.map(u=>u.key));
 const candidates=(kind==='unused'?[...registered].filter(k=>!used.has(k)):[...used].filter(k=>!registered.has(k))).sort();
 return {status:scan.status,data:{candidates,complete:false,safeToRemove:false,unresolved:scan.data.unresolved,scannedFiles:[...new Set(files)].sort(),limitations:scan.data.limitations},diagnostics:[...scan.diagnostics,{code:'INCOMPLETE_USAGE_EVIDENCE',severity:'warning',message:'Candidates are limited to the supplied files and receiver names; do not automatically remove flags.'}]};
}
