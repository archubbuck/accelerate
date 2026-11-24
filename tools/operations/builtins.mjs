import {readFile} from 'node:fs/promises';
import {OperationRegistry,executeOperation} from './engine.mjs';
import {validateSchema} from './schema.mjs';
import {planFlagRegistration} from '../../packages/feature-flags-core/operations/register.mjs';
import {inspectProject} from './project.mjs';
export async function createBuiltinRegistry(root){
 const registry=new OperationRegistry();
 const manifest=JSON.parse(await readFile(new URL('../../packages/feature-flags-core/operations/manifest.json',import.meta.url),'utf8'));
 registry.register(manifest,request=>planFlagRegistration(root,request.input));
 registry.register({id:'project.inspect',version:'1.0.0',package:'@accelerate/tooling-project',description:'Inspect root project metadata',mutatesProject:false,modes:['inspect','preview'],inputSchema:{type:'object',additionalProperties:false},outputSchema:{type:'object'}},async()=>({status:'success',data:await inspectProject(root)}));
 return registry;
}
export async function executeBuiltin(root,request){
 return executeOperation(await createBuiltinRegistry(root),request,{validateSchema});
}
