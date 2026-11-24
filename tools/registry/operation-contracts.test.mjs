import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRequest,validateRequest,response} from '../operations/contracts.mjs';
const request = {schemaVersion:'1.0',operation:'feature-flags.create',operationVersion:'1.0.0',input:{key:'dashboard.redesign'}};
test('requests default to preview and verification',()=>{
  const result=normalizeRequest(request);
  assert.equal(result.ok,true);
  assert.deepEqual(result.request.options,{mode:'preview',atomic:true,verify:true});
  assert.equal(request.options,undefined);
});
test('explicit apply is retained',()=>{
  assert.equal(normalizeRequest({...request,options:{mode:'apply'}}).request.options.mode,'apply');
});
test('invalid envelopes are rejected with structured diagnostics',()=>{
  for(const value of [null,[],{}, {...request,options:{mode:'write'}},{...request,options:{verify:'true'}},{...request,input:[]}]) {
    assert.ok(validateRequest(value).length);
    assert.equal(normalizeRequest(value).ok,false);
  }
});
test('response identity cannot be overwritten by handler fields',()=>{
  const result=response(request,'success',{operation:'other.operation',status:'failed',data:{key:'dashboard.redesign'}});
  assert.equal(result.operation,request.operation);
  assert.equal(result.status,'success');
  assert.deepEqual(result.changes,[]);
  assert.throws(()=>response(request,'unknown'));
});
