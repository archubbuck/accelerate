import {planFlagRename} from './rename.mjs';
import {planUsageRename} from './rename-usages.mjs';
import {planFlagRemoval} from './remove.mjs';
import {planRetirement} from './retire.mjs';
function root(request){
 if(typeof request.context?.projectRoot!=='string'||!request.context.projectRoot)throw Error('PROJECT_ROOT_REQUIRED');
 return request.context.projectRoot;
}
export const rename=request=>planFlagRename(root(request),request.input);
export const previewUsageRename=request=>planUsageRename(root(request),request.input);
export const remove=request=>planFlagRemoval(root(request),request.input);
export const retire=request=>planRetirement(root(request),request.input);
