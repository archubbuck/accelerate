import {applyMixedPlan} from './mixed-apply.mjs';
export async function applyReplacements(root,changes,options={}){
 if(!options.apply)return {status:'blocked',diagnostics:[{code:'EXPLICIT_APPLY_REQUIRED'}]};
 if(!Array.isArray(changes)||changes.some(c=>c?.kind!=='replace'))return {status:'conflict',diagnostics:[{code:'INVALID_PATCH_LIST'}]};
 return applyMixedPlan(root,changes,options);
}
