import {listFlags,describeFlag,validateFlags} from './lifecycle.mjs';
function root(request){
 if(typeof request.context?.projectRoot!=='string'||!request.context.projectRoot)throw Error('PROJECT_ROOT_REQUIRED');
 return request.context.projectRoot;
}
export const list=request=>listFlags(root(request),request.input);
export const describe=request=>describeFlag(root(request),request.input);
export const validate=request=>validateFlags(root(request),request.input);
