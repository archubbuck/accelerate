import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchema,validateSchemaDefinition} from '../operations/schema.mjs';
test('unsupported nested schemas fail closed even for absent values',()=>{
 assert.equal(validateSchema({type:'object',properties:{optional:{pattern:'x'}}},{}),false);
 assert.equal(validateSchema({type:'array',items:{format:'uri'}},[]),false);
 assert.equal(validateSchemaDefinition({type:'object',required:['a','a']}),false);
 assert.equal(validateSchema({type:'object',properties:{optional:{type:'string'}}},{}),true);
 assert.equal(validateSchema({type:'array',items:{type:'string'}},[]),true);
});
