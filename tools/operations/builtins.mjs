import {readFile} from 'node:fs/promises';
import {OperationRegistry,executeOperation} from './engine.mjs';
import {validateSchema} from './schema.mjs';
import {planFlagRegistration} from '../../packages/feature-flags-core/operations/register.mjs';
import {listFlags,planFlagUpdate,describeFlag,validateFlags} from '../../packages/feature-flags-core/operations/lifecycle.mjs';
import {findFlagUsages} from '../../packages/feature-flags-core/operations/usages.mjs';
import {compareFlagUsage} from '../../packages/feature-flags-core/operations/usage-audit.mjs';
import {planUsageRename} from '../../packages/feature-flags-core/operations/rename-usages.mjs';
import {planFlagRename} from '../../packages/feature-flags-core/operations/rename.mjs';
import {planFlagRemoval} from '../../packages/feature-flags-core/operations/remove.mjs';
import {planRetirement} from '../../packages/feature-flags-core/operations/retire.mjs';
import {planIntegration,planCreation} from '../../packages/feature-flags-core/operations/integrate.mjs';
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
 registry.register({...base,id:'feature-flags.describe',description:'Describe an existing flag definition',mutatesProject:false,modes:['inspect','preview'],inputSchema:{type:'object',required:['target','key'],additionalProperties:false,properties:{target,key:{type:'string',minLength:1}}}},request=>describeFlag(root,request.input));
 registry.register({...base,id:'feature-flags.validate',description:'Validate explicit JSON flag definitions',mutatesProject:false,modes:['inspect','preview','verify'],inputSchema:{type:'object',required:['target'],additionalProperties:false,properties:{target}}},request=>validateFlags(root,request.input));
 const strings={type:'array',items:{type:'string',minLength:1}};
 registry.register({...base,id:'feature-flags.find-usages',description:'Find candidate literal flag calls in explicit TypeScript files',mutatesProject:false,modes:['inspect','preview'],inputSchema:{type:'object',required:['files','receivers'],additionalProperties:false,properties:{files:strings,receivers:strings,key:{type:'string',minLength:1}}}},request=>findFlagUsages(root,request.input));
 for(const kind of ['unused','unregistered']){
  registry.register({...base,id:'feature-flags.find-'+kind,description:'Find candidate '+kind+' flags within explicit source scope',mutatesProject:false,modes:['inspect','preview'],inputSchema:{type:'object',required:['target','files','receivers'],additionalProperties:false,properties:{target,files:strings,receivers:strings}}},request=>compareFlagUsage(root,request.input,kind));
 }
 registry.register({...base,id:'feature-flags.preview-usage-rename',description:'Preview candidate source reference renames; not a complete flag rename',mutatesProject:true,modes:['preview','plan'],inputSchema:{type:'object',required:['files','receivers','key','newKey'],additionalProperties:false,properties:{files:strings,receivers:strings,key:{type:'string',minLength:1},newKey:{type:'string',minLength:1}}}},request=>planUsageRename(root,request.input));
 registry.register({...base,id:'feature-flags.rename',description:'Preview coordinated registry and candidate source reference rename',mutatesProject:true,modes:['preview','plan'],inputSchema:{type:'object',required:['target','files','receivers','key','newKey'],additionalProperties:false,properties:{target,files:strings,receivers:strings,key:{type:'string',minLength:1},newKey:{type:'string',minLength:1}}}},request=>planFlagRename(root,request.input));
 registry.register({...base,id:'feature-flags.remove',description:'Preview registry removal after scoped reference checks',mutatesProject:true,modes:['preview','plan'],inputSchema:{type:'object',required:['target','files','receivers','key'],additionalProperties:false,properties:{target,files:strings,receivers:strings,key:{type:'string',minLength:1}}}},request=>planFlagRemoval(root,request.input));
 registry.register({...base,id:'feature-flags.retire',description:'Preview retention of selected conditional branches and removal of registration',mutatesProject:true,modes:['preview','plan'],inputSchema:{type:'object',required:['target','files','receivers','key','retainBehavior'],additionalProperties:false,properties:{target,files:strings,receivers:strings,key:{type:'string',minLength:1},retainBehavior:{enum:['enabled','disabled']}}}},request=>planRetirement(root,request.input));
 const integrationProperties=Object.fromEntries(['file','key','receiver','enabledCall','disabledCall'].map(k=>[k,{type:'string',minLength:1}]));
 for(const [id,handler,properties] of [['integrate',planIntegration,integrationProperties],['create',planCreation,{...integrationProperties,target,enabled:{type:'boolean'}}]]){
  registry.register({...base,id:'feature-flags.'+id,description:'Preview explicit async branch '+id,mutatesProject:true,modes:['preview','plan'],inputSchema:{type:'object',required:Object.keys(properties),additionalProperties:false,properties}},request=>handler(root,request.input));
 }
 return registry;
}
export async function executeBuiltin(root,request){
 return executeOperation(await createBuiltinRegistry(root),request,{validateSchema});
}
