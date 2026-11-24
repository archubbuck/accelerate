import {planReplacement} from '../../../tools/operations/patches.mjs';
// Explicit legacy format: object mapping flag keys to boolean defaults.
export async function planFlagMigration(root,{target,from}){
 let count=0,already=false,invalid=false;
 const change=await planReplacement(root,target,source=>{
  const value=JSON.parse(source);
  if(Array.isArray(value)){
   already=value.every(f=>f&&typeof f.key==='string'&&f.key.trim()&&typeof f.enabled==='boolean')&&new Set(value.map(f=>f.key)).size===value.length;
   invalid=!already;count=value.length;return source;
  }
  if(from!=='boolean-map'||!value||typeof value!=='object'||Object.entries(value).some(([k,v])=>!k.trim()||typeof v!=='boolean')){invalid=true;return source;}
  const flags=Object.entries(value).map(([key,enabled])=>({key,enabled}));
  count=flags.length;
  return JSON.stringify(flags,null,2)+(source.endsWith('\n')?'\n':'');
 });
 if(invalid)return {status:'blocked',data:{count,applySupported:false},diagnostics:[{code:'UNSUPPORTED_MIGRATION_FORMAT',severity:'error'}]};
 return {status:already?'no-op':'success',data:{count,applySupported:false,from,to:'flag-array'},changes:change?[change]:[],diagnostics:[{code:'CONSUMER_MIGRATION_REQUIRED',severity:'warning',message:'Verify that consumer loading code supports the new array format before applying.'}]};
}
