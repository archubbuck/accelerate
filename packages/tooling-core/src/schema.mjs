// Explicitly limited JSON Schema subset. Unsupported keywords fail closed.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keywords=new Set(['type','properties','required','additionalProperties','items','enum','const','minLength','description','title']);
export function validateSchemaDefinition(schema){
 if(!object(schema)||Object.keys(schema).some(k=>!keywords.has(k)))return false;
 if(schema.type!==undefined&&!['object','array','string','boolean','number','integer','null'].includes(schema.type))return false;
 if(Object.hasOwn(schema,'properties')&&(!object(schema.properties)||!Object.values(schema.properties).every(validateSchemaDefinition)))return false;
 if(Object.hasOwn(schema,'items')&&!validateSchemaDefinition(schema.items))return false;
 if(Object.hasOwn(schema,'required')&&(!Array.isArray(schema.required)||!schema.required.every(k=>typeof k==='string')||new Set(schema.required).size!==schema.required.length))return false;
 if(Object.hasOwn(schema,'additionalProperties')&&typeof schema.additionalProperties!=='boolean')return false;
 if(Object.hasOwn(schema,'minLength')&&(!Number.isInteger(schema.minLength)||schema.minLength<0))return false;
 const scalar=x=>x===null||typeof x==='string'||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x);
 if(Object.hasOwn(schema,'const')&&!scalar(schema.const))return false;
 if(Object.hasOwn(schema,'enum')&&(!Array.isArray(schema.enum)||!schema.enum.length||!schema.enum.every(scalar)))return false;
 return true;
}
export function validateSchema(schema,value){
 if(!validateSchemaDefinition(schema))return false;
 if(!object(schema)||Object.keys(schema).some(k=>!keywords.has(k))) return false;
 if(schema.type!==undefined){
  const types={object:object,array:Array.isArray,string:x=>typeof x==='string',boolean:x=>typeof x==='boolean',number:x=>typeof x==='number'&&Number.isFinite(x),integer:Number.isInteger,null:x=>x===null};
  if(typeof schema.type!=='string'||!Object.hasOwn(types,schema.type)||!types[schema.type](value)) return false;
 }
 if(Object.hasOwn(schema,'const')&&(!['string','number','boolean'].includes(typeof schema.const)&&schema.const!==null||value!==schema.const)) return false;
 if(Object.hasOwn(schema,'enum')&&(!Array.isArray(schema.enum)||!schema.enum.every(x=>x===null||['string','number','boolean'].includes(typeof x))||!schema.enum.includes(value))) return false;
 if(Object.hasOwn(schema,'minLength')&&(!Number.isInteger(schema.minLength)||schema.minLength<0||typeof value!=='string'||[...value].length<schema.minLength)) return false;
 if(Object.hasOwn(schema,'items')&&(!Array.isArray(value)||!object(schema.items)||!value.every(x=>validateSchema(schema.items,x)))) return false;
 if(['properties','required','additionalProperties'].some(k=>Object.hasOwn(schema,k))){
  if(!object(value)) return false;
  const props=schema.properties??{};
  if(!object(props)||!Object.values(props).every(object)) return false;
  if(schema.required!==undefined&&(!Array.isArray(schema.required)||!schema.required.every(k=>typeof k==='string'&&Object.hasOwn(value,k)))) return false;
  if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean') return false;
  for(const [key,v] of Object.entries(value)){
   if(Object.hasOwn(props,key)){if(!validateSchema(props[key],v)) return false;}
   else if(schema.additionalProperties===false) return false;
  }
 }
 return true;
}
