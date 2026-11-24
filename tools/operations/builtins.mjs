import {readFile} from 'node:fs/promises';
import {OperationRegistry,executeOperation} from './engine.mjs';
import {validateSchema} from './schema.mjs';
import {planFlagRegistration} from '../../packages/feature-flags-core/operations/register.mjs';
import {listFlags,planFlagUpdate} from '../../packages/feature-flags-core/operations/lifecycle.mjs';
import {inspectProject} from './project.mjs';
export async function createBuiltinRegistry(root){
 const registry=new OperationRegistry();
 const manifest=JSON.parse(await readFile(new URL('../../packages/feature-flags-core/operations/manifest.json',import.meta.url),'utf8'));
 registry.register(manifest,request=>planFlagRegistration(root,request.input));
 registry.register({id:'project.inspect',version:'1.0.0',package:'@accelerate/tooling-project',description:'Inspect root project metadata',mutatesProject:false,modes:['inspect','preview'],inputSchema:{type:'object',additionalProperties:false},outputSchema:{type:'object'}},async()=>({status:'success',data:await inspectProject(root)}));
 const target={type:'string',minLength:1};
 const base={version:'1.0.0',package:'@accelerate/feature-flags-core',outputSchema:{type:'object'}};
 registry.register({...base,id:'feature-flags.list',description:'Inspect explicit JSON flag registry',mutatesProject:false,modes:['inspect','preview'],inputSchema:{type:'object',required:['target'],additionalProperties:false,properties:{target}}},request=>listFlags(root,request.input));
 registry.register({...base,id:'feature-flags.update',description:'Preview change to existing flag default',mutatesProject:true,modes:['plan','preview'],inputSchema:manifest.inputSchema},request=>planFlagUpdate(root,request.input));
 return registry;
}
export async function executeBuiltin(root,request){
 return executeOperation(await createBuiltinRegistry(root),request,{validateSchema});
}
