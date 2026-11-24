// Initial shared operation contract primitives; no project execution or mutation.
export const schemaVersion = '1.0';
export const modes = Object.freeze(['inspect','plan','preview','apply','verify']);
export const statuses = Object.freeze(['success','no-op','partial','failed','blocked','conflict','unsupported','requires-agent']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const version = /^\d+\.\d+\.\d+$/;
export function validateRequest(request) {
  const diagnostics = [];
  const issue = (path,message) => diagnostics.push({code:'INVALID_REQUEST',severity:'error',path,message});
  if (!record(request)) { issue('$','Expected an object'); return diagnostics; }
  if (request.schemaVersion !== schemaVersion) issue('schemaVersion','Unsupported schema version');
  if (typeof request.operation !== 'string' || !identifier.test(request.operation)) issue('operation','Expected a namespaced operation identifier');
  if (typeof request.operationVersion !== 'string' || !version.test(request.operationVersion)) issue('operationVersion','Expected an explicit semantic version');
  if (!record(request.input)) issue('input','Expected an input object');
  if (request.context !== undefined && !record(request.context)) issue('context','Expected a context object');
  if (request.options !== undefined && !record(request.options)) issue('options','Expected an options object');
  else {
    if (request.options?.mode !== undefined && !modes.includes(request.options.mode)) issue('options.mode','Unsupported execution mode');
    for (const key of ['atomic','verify']) if (request.options?.[key] !== undefined && typeof request.options[key] !== 'boolean') issue('options.'+key,'Expected a boolean');
  }
  return diagnostics;
}
export function normalizeRequest(request) {
  const diagnostics = validateRequest(request);
  if (diagnostics.length) return {ok:false,diagnostics};
  return {ok:true,request:{...request,options:{mode:'preview',atomic:true,verify:true,...request.options}}};
}
export function response(request,status,fields={}) {
  if (!statuses.includes(status)) throw new TypeError('Unsupported operation status');
  return {schemaVersion,operation:request.operation,operationVersion:request.operationVersion,status,data:fields.data??{},changes:fields.changes??[],diagnostics:fields.diagnostics??[],verification:fields.verification??[],artifacts:fields.artifacts??[],nextOperations:fields.nextOperations??[]};
}
