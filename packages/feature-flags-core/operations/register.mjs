import {planReplacement} from '../../../tools/operations/patches.mjs';
// Explicit JSON-array registration convention. Consumer must already load this file into its FlagStore.
export async function planFlagRegistration(root,{target,key,enabled}){
 if(typeof key!=='string'||!key.trim()||typeof enabled!=='boolean') throw new TypeError('INVALID_FLAG');
 let outcome='created';
 const change=await planReplacement(root,target,source=>{
   const flags=JSON.parse(source);
   if(!Array.isArray(flags)||flags.some(f=>!f||typeof f.key!=='string'||typeof f.enabled!=='boolean')||new Set(flags.map(f=>f.key)).size!==flags.length) throw new Error('UNSUPPORTED_FLAG_REGISTRY');
   const existing=flags.find(f=>f.key===key);
   if(existing){
     if(existing.enabled!==enabled) throw new Error('FLAG_CONFLICT');
     outcome='existing';return source;
   }
   const indent=source.match(/\n([ \t]+)\{/)?.[1]??'  ';
   const newline=source.includes('\r\n')?'\r\n':'\n';
   return JSON.stringify([...flags,{key,enabled}],null,indent).replace(/\n/g,newline)+(source.endsWith('\n')?newline:'');
 });
 return {status:change?'success':'no-op',data:{key,enabled,outcome,registrationVerified:false},changes:change?[change]:[],diagnostics:[{code:'RUNTIME_WIRING_UNVERIFIED',severity:'warning',message:'The consumer must load this JSON registry into its FlagStore; runtime wiring has not been verified.'}]};
}
