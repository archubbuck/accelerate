import {planIntegration,planCreation} from './integrate.mjs';
import {generateFlagTests} from './generate-tests.mjs';
function root(request){
 if(typeof request.context?.projectRoot!=='string'||!request.context.projectRoot)throw Error('PROJECT_ROOT_REQUIRED');
 return request.context.projectRoot;
}
export const integrate=request=>planIntegration(root(request),request.input);
export const create=request=>planCreation(root(request),request.input);
export const generateTests=request=>generateFlagTests(root(request),request.input);
