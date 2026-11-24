import type {ModelResponse} from "@accelerate/ai-core";
import {validate,type Schema} from "@accelerate/validation-core";
export function parseStructured<T>(response:ModelResponse,schema:Schema<T>):T{let value:unknown;try{value=JSON.parse(response.content);}catch{throw new Error("Model output is not valid JSON");}return validate(schema,value);}
