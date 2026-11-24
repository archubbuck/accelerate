import {validateSchemaDefinition} from './schema.mjs';
import {normalizeRequest,response,modes,statuses} from './contracts.mjs';
const idPattern=/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const versionPattern=/^\d+\.\d+\.\d+$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validateManifest(m) {
  const errors=[];
  if(!record(m)) return ['Manifest must be an object'];
  if(typeof m.id!=='string'||!idPattern.test(m.id)) errors.push('Invalid operation identifier');
  if(typeof m.version!=='string'||!versionPattern.test(m.version)) errors.push('Invalid operation version');
  if(typeof m.package!=='string'||!m.package.startsWith('@accelerate/')) errors.push('Invalid package owner');
  if(typeof m.description!=='string'||!m.description.trim()) errors.push('Description required');
  if(typeof m.mutatesProject!=='boolean') errors.push('Mutation declaration required');
  if(!Array.isArray(m.modes)||!m.modes.length||m.modes.some(x=>!modes.includes(x))||new Set(m.modes).size!==m.modes.length) errors.push('Invalid execution modes');
  if(Array.isArray(m.modes)&&m.modes.includes('apply')&&(!m.mutatesProject||!m.modes.includes('preview'))) errors.push('Apply requires mutation declaration and preview support');
  for(const key of ['inputSchema','outputSchema']) if(!validateSchemaDefinition(m[key])) errors.push(key+' invalid or unsupported');
  return errors;
}
export class OperationRegistry {
  #entries=new Map();
  register(manifest,handler) {
    const errors=validateManifest(manifest);
    if(errors.length) throw new TypeError(errors.join('; '));
    if(typeof handler!=='function') throw new TypeError('Handler required');
    const key=manifest.id+'@'+manifest.version;
    if(this.#entries.has(key)) throw new Error('Duplicate operation '+key);
    this.#entries.set(key,{manifest:structuredClone(manifest),handler});
  }
  list(){return [...this.#entries.values()].map(x=>structuredClone(x.manifest)).sort((a,b)=> (a.id+'@'+a.version).localeCompare(b.id+'@'+b.version,'en'));}
  resolve(id,version){const entry=this.#entries.get(id+'@'+version);return entry&&{manifest:structuredClone(entry.manifest),handler:entry.handler};}
}
const diagnostic=(code,message)=>({code,severity:'error',message});
export async function executeOperation(registry,raw,{validateSchema}={}) {
  const normalized=normalizeRequest(raw);
  if(!normalized.ok) return response({operation:typeof raw?.operation==='string'?raw.operation:'unknown.operation',operationVersion:typeof raw?.operationVersion==='string'?raw.operationVersion:'0.0.0'},'failed',{diagnostics:normalized.diagnostics});
  const request=normalized.request;
  const fail=(status,code,message)=>response(request,status,{diagnostics:[diagnostic(code,message)]});
  const entry=registry.resolve(request.operation,request.operationVersion);
  if(!entry) return fail('unsupported','OPERATION_NOT_FOUND','Operation version is not registered');
  if(!entry.manifest.modes.includes(request.options.mode)) return fail('unsupported','MODE_NOT_SUPPORTED','Requested mode is not supported');
  // Mutations remain disabled until the patch engine can enforce transactional safety.
  if(request.options.mode==='apply') return fail('blocked','PATCH_ENGINE_REQUIRED','Mutation execution is not enabled');
  if(typeof validateSchema!=='function') return fail('blocked','SCHEMA_VALIDATOR_REQUIRED','A schema validator is required');
  try {
    if(!await validateSchema(entry.manifest.inputSchema,request.input)) return fail('failed','INVALID_INPUT','Input schema validation failed');
    const result=await entry.handler(request);
    if(!record(result)||!statuses.includes(result.status)) return fail('failed','INVALID_HANDLER_RESULT','Handler returned an invalid status');
    const envelope=response(request,result.status,result);
    if(['success','no-op'].includes(envelope.status)&&!await validateSchema(entry.manifest.outputSchema,envelope.data)) return fail('failed','INVALID_OUTPUT','Output schema validation failed');
    return envelope;
  } catch {
    return fail('failed','EXECUTION_FAILED','Operation execution failed; inspect controlled diagnostics');
  }
}
