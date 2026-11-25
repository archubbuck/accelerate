import {findFlagUsages} from './usages.mjs';
import {compareFlagUsage} from './usage-audit.mjs';
function root(request){
 if(typeof request.context?.projectRoot!=='string'||!request.context.projectRoot)throw Error('PROJECT_ROOT_REQUIRED');
 return request.context.projectRoot;
}
export const findUsages=request=>findFlagUsages(root(request),request.input);
export const findUnused=request=>compareFlagUsage(root(request),request.input,'unused');
export const findUnregistered=request=>compareFlagUsage(root(request),request.input,'unregistered');
