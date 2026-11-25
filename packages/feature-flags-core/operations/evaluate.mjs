// Standalone read-only operation; no filesystem or application runtime access.
export function evaluate({input:{flag,context={}}}){
 const attributes=context.attributes??{};
 for(const rule of flag.rules??[]){
  if(Object.hasOwn(attributes,rule.attribute)&&attributes[rule.attribute]===rule.equals)return {status:'success',data:{enabled:rule.enabled,runtimeWiringVerified:false}};
 }
 return {status:'success',data:{enabled:flag.enabled,runtimeWiringVerified:false}};
}
