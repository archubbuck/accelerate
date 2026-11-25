import {planFlagRegistration} from './register.mjs';
import {planFlagUpdate} from './lifecycle.mjs';
import {planFlagMigration} from './migrate.mjs';
function root(request){
 if(typeof request.context?.projectRoot!=='string'||!request.context.projectRoot)throw Error('PROJECT_ROOT_REQUIRED');
 return request.context.projectRoot;
}
export const register=request=>planFlagRegistration(root(request),request.input);
export const update=request=>planFlagUpdate(root(request),request.input);
export const migrate=request=>planFlagMigration(root(request),request.input);
